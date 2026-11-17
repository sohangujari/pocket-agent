import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../src/llm.ts";
import { scriptedProvider } from "./scripted-provider.ts";

const options = {
  baseUrl: "https://scripted.test/v1",
  apiKey: "test-key",
  model: "test-model",
  provider: "scripted",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScriptedProvider + streamChat", () => {
  it("streams text in deltas and reports usage", async () => {
    const provider = scriptedProvider([{ content: "Hello there", usage: { input: 10, output: 4 } }]);
    vi.stubGlobal("fetch", provider.fetch);

    const deltas: string[] = [];
    const result = await streamChat({ ...options, onDelta: (d) => deltas.push(d) });

    expect(deltas.join("")).toBe("Hello there");
    expect(result.content).toBe("Hello there");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(4);
    expect(result.finishReason).toBe("stop");
    expect(provider.calls).toBe(1);
  });

  it("reassembles tool calls split across deltas", async () => {
    const provider = scriptedProvider([
      {
        toolCalls: [
          {
            id: "call_1",
            name: "schedule_create",
            arguments: { title: "Drink water", when: "2026-11-17 09:00" },
          },
        ],
      },
      { content: "Scheduled." },
    ]);
    vi.stubGlobal("fetch", provider.fetch);

    const first = await streamChat({ ...options, messages: [{ role: "user", content: "hi" }] });
    expect(first.toolCalls).toHaveLength(1);
    expect(first.toolCalls[0].id).toBe("call_1");
    expect(first.toolCalls[0].function.name).toBe("schedule_create");
    expect(JSON.parse(first.toolCalls[0].function.arguments)).toEqual({
      title: "Drink water",
      when: "2026-11-17 09:00",
    });
    expect(first.finishReason).toBe("tool_calls");

    const second = await streamChat({ ...options, messages: [{ role: "user", content: "hi" }] });
    expect(second.content).toBe("Scheduled.");
    expect(provider.calls).toBe(2);
  });

  it("surfaces provider errors as LLMError with the status", async () => {
    const provider = scriptedProvider([{ status: 429 }]);
    vi.stubGlobal("fetch", provider.fetch);

    await expect(streamChat({ ...options })).rejects.toMatchObject({
      name: "LLMError",
      status: 429,
      retryable: true,
    });
  });
});
