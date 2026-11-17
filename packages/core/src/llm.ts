/**
 * A small OpenAI-compatible chat client.
 *
 * Every supported provider (OpenAI, Anthropic, Gemini, Z.ai, OpenRouter and any
 * custom /v1 endpoint) speaks this dialect, so one implementation covers all of
 * them. No SDK, no lock-in, predictable streaming and tool-call parsing.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolSchema = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: string | null;
  provider: string;
  model: string;
};

export class LLMError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.name = "LLMError";
    this.status = status;
    this.retryable = retryable;
  }
}

/** Rough public list prices, USD per 1M tokens. Used for the cost ledger only. */
const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /claude.*opus/i, input: 15, output: 75 },
  { match: /claude.*sonnet/i, input: 3, output: 15 },
  { match: /claude.*haiku/i, input: 0.8, output: 4 },
  { match: /gpt-5\.1|gpt-5(?!-mini)/i, input: 1.25, output: 10 },
  { match: /gpt-5-mini|gpt-5\.1-mini/i, input: 0.25, output: 2 },
  { match: /gpt-4\.1-mini/i, input: 0.4, output: 1.6 },
  { match: /gpt-4\.1/i, input: 2, output: 8 },
  { match: /o4-mini/i, input: 1.1, output: 4.4 },
  { match: /gemini.*pro/i, input: 1.25, output: 10 },
  { match: /gemini.*flash-lite/i, input: 0.1, output: 0.4 },
  { match: /gemini.*flash/i, input: 0.3, output: 2.5 },
  { match: /glm-4\.6/i, input: 0.6, output: 2.2 },
  { match: /glm-4\.5/i, input: 0.2, output: 1.1 },
  { match: /deepseek/i, input: 0.27, output: 1.1 },
];

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES.find((p) => p.match.test(model));
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function normaliseUsage(raw: any, model: string): Usage {
  const inputTokens = Number(raw?.prompt_tokens ?? raw?.input_tokens ?? 0);
  const outputTokens = Number(raw?.completion_tokens ?? raw?.output_tokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(raw?.total_tokens ?? inputTokens + outputTokens),
    costUsd: estimateCost(model, inputTokens, outputTokens),
  };
}

export type StreamOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  extraHeaders?: Record<string, string>;
};

export async function streamChat(opts: StreamOptions): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(joinUrl(opts.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "Pocket Agent",
        ...opts.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? AbortSignal.timeout(180_000),
    });
  } catch (error) {
    throw new LLMError(
      error instanceof Error ? error.message : "Network error calling model provider",
      0,
      true,
    );
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    throw new LLMError(
      `${opts.provider} returned ${res.status}: ${text.slice(0, 500) || res.statusText}`,
      res.status,
      retryable,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;
  let usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
  const calls = new Map<number, { id: string; name: string; args: string }>();

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;

    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }

    if (json.usage) usage = normaliseUsage(json.usage, opts.model);

    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;

    const delta = choice.delta ?? choice.message ?? {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
      opts.onDelta?.(delta.content);
    }

    const toolDeltas = delta.tool_calls as any[] | undefined;
    if (Array.isArray(toolDeltas)) {
      for (let i = 0; i < toolDeltas.length; i++) {
        const td = toolDeltas[i];
        const index = typeof td.index === "number" ? td.index : i;
        const current = calls.get(index) ?? { id: "", name: "", args: "" };
        if (td.id) current.id = td.id;
        if (td.function?.name) current.name += td.function.name;
        if (td.function?.arguments) current.args += td.function.arguments;
        calls.set(index, current);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (buffer) handleLine(buffer);

  const toolCalls: ToolCall[] = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, c]) => c.name)
    .map(([index, c]) => ({
      id: c.id || `call_${Date.now()}_${index}`,
      type: "function" as const,
      function: { name: c.name, arguments: c.args || "{}" },
    }));

  if (usage.totalTokens === 0) {
    usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
  }

  return {
    content,
    toolCalls,
    usage,
    finishReason,
    provider: opts.provider,
    model: opts.model,
  };
}

export type ChatOptions = Omit<StreamOptions, "onDelta"> & {
  jsonMode?: boolean;
};

/** Non-streaming call, used by the learning loop and small utility jobs. */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: false,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(joinUrl(opts.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
        ...opts.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new LLMError(
      error instanceof Error ? error.message : "Network error calling model provider",
      0,
      true,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(
      `${opts.provider} returned ${res.status}: ${text.slice(0, 500) || res.statusText}`,
      res.status,
      res.status === 429 || res.status >= 500,
    );
  }

  const json: any = await res.json();
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};
  const rawCalls = (message.tool_calls ?? []) as any[];

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: rawCalls.map((c, i) => ({
      id: c.id ?? `call_${Date.now()}_${i}`,
      type: "function" as const,
      function: {
        name: c.function?.name ?? "",
        arguments:
          typeof c.function?.arguments === "string"
            ? c.function.arguments
            : JSON.stringify(c.function?.arguments ?? {}),
      },
    })),
    usage: normaliseUsage(json.usage, opts.model),
    finishReason: choice?.finish_reason ?? null,
    provider: opts.provider,
    model: opts.model,
  };
}
