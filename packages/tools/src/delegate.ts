import { and, desc, eq } from "drizzle-orm";
import { executeRun } from "@pocket/core";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { LIMITS } from "@pocket/shared";
import { z } from "zod";
import { defineTool } from "./helpers.js";

export const delegateTask = defineTool({
  name: "delegate_task",
  description:
    "Hand a self-contained sub-task to a child agent with its own context. Use it to parallelise independent research or to keep a large job out of the main conversation. The child returns a summary, not its full transcript.",
  schema: z.object({
    task: z.string().min(10).max(4000),
    label: z.string().max(80).optional(),
  }),
  risk: "caution",
  toolsets: ["delegate"],
  timeoutMs: 240_000,
  label: "Delegating",
  async run(input, ctx) {
    if (ctx.depth >= LIMITS.maxDelegationDepth) {
      return { error: "Maximum delegation depth reached. Do this work yourself." };
    }

    const db = getDb();
    const [session] = await db
      .insert(sessions)
      .values({
        title: input.label ?? `Delegated: ${input.task.slice(0, 48)}`,
        source: "delegate",
      })
      .returning({ id: sessions.id });

    await db.insert(messages).values({
      sessionId: session.id,
      role: "user",
      content: input.task,
    });

    const [child] = await db
      .insert(runs)
      .values({
        sessionId: session.id,
        parentRunId: ctx.runId,
        status: "queued",
        input: input.task,
        maxSteps: 12,
        source: "delegate",
      })
      .returning({ id: runs.id });

    await ctx.emit("delegate_started", {
      childRunId: child.id,
      label: input.label ?? input.task.slice(0, 60),
    });

    await executeRun(child.id, ctx.registry, ctx.depth + 1);

    const [final] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(and(eq(messages.sessionId, session.id), eq(messages.role, "assistant")))
      .orderBy(desc(messages.seq))
      .limit(1);

    await ctx.emit("delegate_finished", { childRunId: child.id });

    return {
      childRunId: child.id,
      sessionId: session.id,
      result: final?.content ?? "(the child agent did not produce a final message)",
    };
  },
});
