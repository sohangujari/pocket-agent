import { eq } from "drizzle-orm";
import { getDb, runs } from "@pocket/db";
import { z } from "zod";
import { defineTool } from "./helpers.js";

export const todoWrite = defineTool({
  name: "todo_write",
  description:
    "Maintain a short task checklist for the current run. Use it for anything with more than three steps so the user can see progress. Send the full list each time.",
  schema: z.object({
    items: z
      .array(
        z.object({
          text: z.string().min(1).max(200),
          status: z.enum(["pending", "in_progress", "done"]).default("pending"),
        }),
      )
      .max(20),
  }),
  risk: "safe",
  toolsets: ["system"],
  label: "Updating the plan",
  async run(input, ctx) {
    const db = getDb();
    const [run] = await db
      .select({ checkpoint: runs.checkpoint })
      .from(runs)
      .where(eq(runs.id, ctx.runId))
      .limit(1);

    const checkpoint = {
      ...((run?.checkpoint as Record<string, unknown>) ?? {}),
      todos: input.items,
    };
    await db.update(runs).set({ checkpoint }).where(eq(runs.id, ctx.runId));
    await ctx.emit("todo", { items: input.items });

    return {
      saved: true,
      counts: {
        pending: input.items.filter((i) => i.status === "pending").length,
        in_progress: input.items.filter((i) => i.status === "in_progress").length,
        done: input.items.filter((i) => i.status === "done").length,
      },
    };
  },
});

export const clarify = defineTool({
  name: "clarify",
  description:
    "Ask the user one question when a missing detail would change the outcome. Call this, then stop and wait — do not keep working on assumptions.",
  schema: z.object({
    question: z.string().min(5).max(500),
    options: z.array(z.string().max(80)).max(5).default([]),
  }),
  risk: "safe",
  toolsets: ["system"],
  label: "Asking a question",
  async run(input, ctx) {
    await ctx.emit("clarify", { question: input.question, options: input.options });
    return {
      asked: true,
      note: "The question is now visible to the user. End your turn and wait for the answer.",
    };
  },
});
