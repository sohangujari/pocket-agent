/**
 * ScriptedProvider — a fake OpenAI-compatible endpoint for tests.
 *
 * It answers `/chat/completions` from a fixture, streaming SSE exactly like a
 * real provider (split text, tool-call deltas, usage, [DONE]). Tests stub
 * `globalThis.fetch` with it, so the agent loop runs with no network and no
 * tokens. See docs/PRD.md §5.
 */

export type ScriptedToolCall = {
  id?: string;
  name: string;
  /** Passed as JSON in the tool-call deltas, split across two chunks on purpose. */
  arguments: Record<string, unknown>;
};

export type ScriptedStep = {
  content?: string;
  toolCalls?: ScriptedToolCall[];
  usage?: { input?: number; output?: number };
  /** When set, the step answers with this HTTP status instead of a completion. */
  status?: number;
  /** Delay before answering, for cancellation tests. */
  delayMs?: number;
};

export type ScriptedProvider = {
  fetch: typeof fetch;
  /** How many completions have been served. */
  readonly calls: number;
  reset(steps?: ScriptedStep[]): void;
};

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function completionChunks(step: ScriptedStep): string[] {
  const chunks: string[] = [];
  const content = step.content ?? "";

  if (content) {
    const mid = Math.max(1, Math.floor(content.length / 2));
    for (const part of [content.slice(0, mid), content.slice(mid)]) {
      if (!part) continue;
      chunks.push(
        sse({ choices: [{ index: 0, delta: { content: part }, finish_reason: null }] }),
      );
    }
  }

  (step.toolCalls ?? []).forEach((call, index) => {
    const id = call.id ?? `call_scripted_${index}`;
    const args = JSON.stringify(call.arguments);
    const mid = Math.max(1, Math.floor(args.length / 2));
    chunks.push(
      sse({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index,
                  id,
                  type: "function",
                  function: { name: call.name, arguments: args.slice(0, mid) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    );
    chunks.push(
      sse({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index, function: { arguments: args.slice(mid) } }],
            },
            finish_reason: null,
          },
        ],
      }),
    );
  });

  const input = step.usage?.input ?? 12;
  const output = step.usage?.output ?? Math.max(1, content.length);
  chunks.push(
    sse({
      choices: [{ index: 0, delta: {}, finish_reason: step.toolCalls?.length ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
    }),
  );
  chunks.push("data: [DONE]\n\n");
  return chunks;
}

export function scriptedProvider(initialSteps: ScriptedStep[]): ScriptedProvider {
  let steps = [...initialSteps];
  let calls = 0;

  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const step = steps[Math.min(calls, steps.length - 1)] ?? { content: "" };
    calls += 1;

    if (step.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    }

    if (step.status && step.status >= 400) {
      return new Response(JSON.stringify({ error: { message: "scripted provider error" } }), {
        status: step.status,
        headers: { "content-type": "application/json" },
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (body.stream === false) {
      const content = step.content ?? "";
      return new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: step.toolCalls?.length ? "tool_calls" : "stop",
              message: {
                role: "assistant",
                content,
                tool_calls: (step.toolCalls ?? []).map((call, index) => ({
                  id: call.id ?? `call_scripted_${index}`,
                  type: "function",
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              },
            },
          ],
          usage: {
            prompt_tokens: step.usage?.input ?? 12,
            completion_tokens: step.usage?.output ?? Math.max(1, content.length),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const chunks = completionChunks(step);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  }) as typeof fetch;

  return {
    fetch: fetchFn,
    get calls() {
      return calls;
    },
    reset(next?: ScriptedStep[]) {
      if (next) steps = [...next];
      calls = 0;
    },
  };
}
