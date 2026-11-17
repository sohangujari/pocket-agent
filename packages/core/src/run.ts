import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  approvals,
  getDb,
  messages,
  runEvents,
  runs,
  sessions,
  usageLedger,
} from "@pocket/db";
import { LIMITS } from "@pocket/shared";
import { serverEnv } from "@pocket/shared/env";
import { buildContext } from "./context.js";
import { LLMError, streamChat, type ToolCall } from "./llm.js";
import { NoModelConfiguredError, resolveModels } from "./models.js";
import { reflectRun } from "./reflect.js";
import type { ToolContext, ToolDefinition, ToolRegistry } from "./tools.js";

function needsApproval(risk: string): boolean {
  const mode = serverEnv.approvalMode;
  if (mode === "never") return false;
  if (mode === "writes") return risk !== "safe";
  return risk === "dangerous";
}

function truncate(value: string, max = LIMITS.maxToolOutputChars): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n… truncated (${value.length - max} characters omitted)`;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function pendingCalls(runId: string): Promise<ToolCall[]> {
  const db = getDb();
  const [assistant] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.runId, runId),
        eq(messages.role, "assistant"),
        isNotNull(messages.toolCalls),
      ),
    )
    .orderBy(desc(messages.seq))
    .limit(1);

  if (!assistant || !Array.isArray(assistant.toolCalls) || assistant.toolCalls.length === 0) {
    return [];
  }
  const calls = assistant.toolCalls as ToolCall[];

  const answered = await db
    .select({ toolCallId: messages.toolCallId })
    .from(messages)
    .where(and(eq(messages.runId, runId), eq(messages.role, "tool")));

  const answeredIds = new Set(answered.map((a) => a.toolCallId).filter(Boolean));
  return calls.filter((c) => !answeredIds.has(c.id));
}

type ExecuteDeps = {
  runId: string;
  sessionId: string;
  registry: ToolRegistry;
  emit: (type: string, payload: unknown) => Promise<void>;
  depth: number;
};

/**
 * Executes any tool calls that have not been answered yet.
 * Returns true when the run paused for human approval.
 */
async function executePendingCalls(deps: ExecuteDeps): Promise<boolean> {
  const db = getDb();
  const calls = await pendingCalls(deps.runId);
  if (calls.length === 0) return false;

  for (const call of calls) {
    const [fresh] = await db.select().from(runs).where(eq(runs.id, deps.runId)).limit(1);
    if (fresh?.status === "cancelled") return true;

    const tool = deps.registry.get(call.function.name);
    let args: unknown = {};
    try {
      args = JSON.parse(call.function.arguments || "{}");
    } catch {
      args = {};
    }

    const saveToolResult = async (content: string) => {
      await db.insert(messages).values({
        sessionId: deps.sessionId,
        runId: deps.runId,
        role: "tool",
        toolCallId: call.id,
        name: call.function.name,
        content,
      });
    };

    if (!tool) {
      await saveToolResult(`Error: unknown tool "${call.function.name}".`);
      await deps.emit("tool_result", {
        id: call.id,
        name: call.function.name,
        ok: false,
        output: `Unknown tool "${call.function.name}"`,
      });
      continue;
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      const message = `Invalid arguments for ${tool.name}: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`;
      await saveToolResult(message);
      await deps.emit("tool_result", { id: call.id, name: tool.name, ok: false, output: message });
      continue;
    }

    if (needsApproval(tool.risk)) {
      const [existing] = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.runId, deps.runId), eq(approvals.toolCallId, call.id)))
        .limit(1);

      if (!existing) {
        const [created] = await db
          .insert(approvals)
          .values({
            runId: deps.runId,
            toolCallId: call.id,
            toolName: tool.name,
            risk: tool.risk,
            input: args as any,
          })
          .returning({ id: approvals.id });

        await db
          .update(runs)
          .set({ status: "awaiting_approval", heartbeatAt: new Date() })
          .where(eq(runs.id, deps.runId));

        await deps.emit("approval_request", {
          approvalId: created.id,
          toolCallId: call.id,
          name: tool.name,
          args,
          risk: tool.risk,
        });
        return true;
      }

      if (existing.decision === "pending") return true;

      if (existing.decision === "rejected") {
        await saveToolResult("The user rejected this action. Do not retry it without asking.");
        await deps.emit("tool_result", {
          id: call.id,
          name: tool.name,
          ok: false,
          output: "Rejected by the user.",
        });
        continue;
      }
    }

    await deps.emit("tool_call", {
      id: call.id,
      name: tool.name,
      label: tool.label ?? tool.name,
      args,
      risk: tool.risk,
    });

    const started = Date.now();
    let ok = true;
    let output: unknown;

    const controller = new AbortController();
    const ctx: ToolContext = {
      runId: deps.runId,
      sessionId: deps.sessionId,
      userId: "owner",
      depth: deps.depth,
      registry: deps.registry,
      signal: controller.signal,
      emit: deps.emit,
    };

    try {
      output = await withTimeout(
        tool.run(parsed.data, ctx),
        tool.timeoutMs ?? 60_000,
        tool.name,
      );
    } catch (error) {
      ok = false;
      output = { error: error instanceof Error ? error.message : String(error) };
    }

    const content = truncate(stringify(output));
    await saveToolResult(content);
    await deps.emit("tool_result", {
      id: call.id,
      name: tool.name,
      ok,
      output: content,
      durationMs: Date.now() - started,
    });
  }

  return false;
}

export async function executeRun(
  runId: string,
  registry: ToolRegistry,
  depth = 0,
): Promise<void> {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) return;
  if (["awaiting_approval", "completed", "failed", "cancelled"].includes(run.status)) return;

  await db
    .update(runs)
    .set({
      status: "running",
      startedAt: run.startedAt ?? new Date(),
      heartbeatAt: new Date(),
    })
    .where(eq(runs.id, runId));

  const emit = async (type: string, payload: unknown) => {
    await db.insert(runEvents).values({ runId, type, payload: payload as any });
  };

  if (run.step === 0) {
    await emit("run_started", { input: run.input, at: new Date().toISOString() });
  }

  let tokensUsed = run.tokensUsed;
  const maxTokens = serverEnv.maxRunTokens;

  try {
    for (let step = run.step; step < run.maxSteps; step++) {
      const [fresh] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      if (!fresh) return;
      if (fresh.status === "cancelled") {
        await emit("cancelled", {});
        return;
      }

      await db
        .update(runs)
        .set({ step, heartbeatAt: new Date(), status: "running" })
        .where(eq(runs.id, runId));

      const paused = await executePendingCalls({
        runId,
        sessionId: run.sessionId,
        registry,
        emit,
        depth,
      });
      if (paused) return;

      const context = await buildContext(run.sessionId);
      const chain = await resolveModels("main");
      if (chain.length === 0) throw new NoModelConfiguredError("main");

      await emit("step_started", { step: step + 1 });

      let pendingText = "";
      let lastFlush = Date.now();
      let textChain: Promise<void> = Promise.resolve();

      const pushText = (delta: string) => {
        pendingText += delta;
        if (Date.now() - lastFlush < 120 && pendingText.length < 400) return;
        const chunk = pendingText;
        pendingText = "";
        lastFlush = Date.now();
        textChain = textChain.then(() => emit("text", { delta: chunk }));
      };

      let result: Awaited<ReturnType<typeof streamChat>> | null = null;
      let lastError: unknown = null;

      for (const model of chain) {
        try {
          result = await streamChat({
            baseUrl: model.baseUrl,
            apiKey: model.apiKey,
            model: model.model,
            provider: model.provider,
            messages: [{ role: "system", content: context.system }, ...context.messages],
            tools: registry.schemas(),
            temperature: 0.4,
            signal: AbortSignal.timeout(240_000),
            onDelta: pushText,
          });
          break;
        } catch (error) {
          lastError = error;
          await emit("provider_error", {
            provider: model.provider,
            model: model.model,
            message: error instanceof Error ? error.message : String(error),
            retryable: error instanceof LLMError ? error.retryable : true,
          });
        }
      }

      await textChain;
      if (pendingText) {
        const chunk = pendingText;
        pendingText = "";
        await emit("text", { delta: chunk });
      }
      if (!result) throw lastError ?? new Error("All model providers failed");

      tokensUsed += result.usage.totalTokens;

      await db.insert(usageLedger).values({
        runId,
        provider: result.provider,
        model: result.model,
        role: "main",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      });

      await db.insert(messages).values({
        sessionId: run.sessionId,
        runId,
        role: "assistant",
        content: result.content || null,
        toolCalls: result.toolCalls.length > 0 ? (result.toolCalls as any) : null,
      });

      await db
        .update(runs)
        .set({
          tokensUsed,
          costUsd: sql`${runs.costUsd} + ${result.usage.costUsd}`,
          heartbeatAt: new Date(),
        })
        .where(eq(runs.id, runId));

      await emit("usage", {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
        total: tokensUsed,
      });

      if (tokensUsed > maxTokens) {
        throw new Error(
          `Run token budget exceeded (${tokensUsed.toLocaleString()} / ${maxTokens.toLocaleString()}).`,
        );
      }

      if (result.toolCalls.length === 0) {
        await db
          .update(runs)
          .set({
            status: "completed",
            step: step + 1,
            tokensUsed,
            finishedAt: new Date(),
            heartbeatAt: new Date(),
          })
          .where(eq(runs.id, runId));

        await db
          .update(sessions)
          .set({
            updatedAt: new Date(),
            tokenCount: sql`${sessions.tokenCount} + ${result.usage.totalTokens}`,
          })
          .where(eq(sessions.id, run.sessionId));

        await emit("done", {
          tokens: result.usage.totalTokens,
          costUsd: result.usage.costUsd,
        });

        void reflectRun(runId).catch((error) => console.error("[reflect]", error));
        return;
      }
    }

    throw new Error(`Reached the step limit (${run.maxSteps}) without finishing.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(runs)
      .set({
        status: "failed",
        error: message,
        tokensUsed,
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(runs.id, runId));
    await emit("error", { message });
    console.error(`[run ${runId}]`, message);
  }
}

export async function cancelRun(runId: string): Promise<void> {
  const db = getDb();
  await db
    .update(runs)
    .set({ status: "cancelled", finishedAt: new Date(), heartbeatAt: new Date() })
    .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running", "awaiting_approval"])));
}

/** Requeue runs whose worker died (Render spin-down, deploy, crash). */
export async function requeueStaleRuns(olderThanSeconds = 90): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(runs)
    .set({ status: "queued", heartbeatAt: new Date() })
    .where(
      and(
        eq(runs.status, "running"),
        sql`coalesce(${runs.heartbeatAt}, ${runs.startedAt}, ${runs.createdAt}) < now() - (${olderThanSeconds} * interval '1 second')`,
      ),
    )
    .returning({ id: runs.id });
  return rows.length;
}
