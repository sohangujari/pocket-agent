import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, journeyEvents, memories, memoryVersions } from "@pocket/db";
import { MEMORY_BUDGETS } from "@pocket/shared";
import { defineTool } from "./helpers.js";
import { z } from "zod";

async function pinnedChars(scope: "agent" | "user"): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ content: memories.content })
    .from(memories)
    .where(
      and(
        eq(memories.status, "active"),
        eq(memories.pinned, true),
        eq(memories.scope, scope),
      ),
    );
  return rows.reduce((sum, r) => sum + r.content.length + 3, 0);
}

export const memoryAdd = defineTool({
  name: "memory_add",
  description:
    "Store a durable fact, preference or lesson. Use scope='user' for things about the owner (preferences, setup, conventions) and scope='agent' for lessons about how to do the work. Set pin=true to load it into core memory on every turn; core memory is small, so only pin what is broadly useful.",
  schema: z.object({
    content: z.string().min(3).max(500).describe("One self-contained sentence."),
    scope: z.enum(["agent", "user"]).default("agent"),
    kind: z.enum(["fact", "preference", "procedure", "context"]).default("fact"),
    pin: z.boolean().default(true),
    reason: z.string().max(300).optional(),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Remembering",
  async run(input, ctx) {
    const db = getDb();
    const budget = MEMORY_BUDGETS[input.scope];
    const used = await pinnedChars(input.scope);
    const fits = used + input.content.length + 3 <= budget;
    const pinned = input.pin && fits;

    const [created] = await db
      .insert(memories)
      .values({
        scope: input.scope,
        kind: input.kind,
        content: input.content.trim(),
        pinned,
        status: "active",
        reason: input.reason ?? null,
        sourceRunId: ctx.runId,
      })
      .returning({ id: memories.id });

    await db.insert(memoryVersions).values({
      memoryId: created.id,
      content: input.content.trim(),
      changedBy: "agent",
      reason: input.reason ?? "Added by the agent",
    });

    await db.insert(journeyEvents).values({
      type: "memory_added",
      refId: created.id,
      summary: input.content.slice(0, 140),
      meta: { scope: input.scope, pinned },
    });

    return {
      stored: true,
      pinned,
      note: pinned
        ? "Added to core memory."
        : `Stored in searchable memory. Core ${input.scope} memory is full (${used}/${budget} chars) — consolidate before pinning more.`,
    };
  },
});

export const memoryPropose = defineTool({
  name: "memory_propose",
  description:
    "Propose a memory for the owner to review instead of writing it directly. Use this for inferences, not for facts the user explicitly asked you to remember.",
  schema: z.object({
    content: z.string().min(3).max(500),
    scope: z.enum(["agent", "user"]).default("agent"),
    kind: z.enum(["fact", "preference", "procedure", "context"]).default("fact"),
    reason: z.string().max(300).optional(),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Proposing a memory",
  async run(input, ctx) {
    const db = getDb();
    const [created] = await db
      .insert(memories)
      .values({
        scope: input.scope,
        kind: input.kind,
        content: input.content.trim(),
        status: "pending",
        pinned: false,
        reason: input.reason ?? null,
        sourceRunId: ctx.runId,
      })
      .returning({ id: memories.id });

    await db.insert(journeyEvents).values({
      type: "memory_proposed",
      refId: created.id,
      summary: input.content.slice(0, 140),
      meta: { scope: input.scope },
    });

    return { proposed: true, id: created.id, note: "Queued for the owner to review." };
  },
});

export const memoryUpdate = defineTool({
  name: "memory_update",
  description: "Replace the content of an existing memory by id. Use memory_search to find the id first.",
  schema: z.object({
    id: z.string().uuid(),
    content: z.string().min(3).max(500),
    reason: z.string().max(300).optional(),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Updating memory",
  async run(input) {
    const db = getDb();
    const [updated] = await db
      .update(memories)
      .set({ content: input.content.trim(), updatedAt: new Date() })
      .where(eq(memories.id, input.id))
      .returning({ id: memories.id });

    if (!updated) return { updated: false, error: "Memory not found." };

    await db.insert(memoryVersions).values({
      memoryId: input.id,
      content: input.content.trim(),
      changedBy: "agent",
      reason: input.reason ?? "Updated by the agent",
    });

    await db.insert(journeyEvents).values({
      type: "memory_updated",
      refId: input.id,
      summary: input.content.slice(0, 140),
      meta: {},
    });

    return { updated: true };
  },
});

export const memoryRemove = defineTool({
  name: "memory_remove",
  description: "Archive a memory that is wrong or no longer relevant.",
  schema: z.object({
    id: z.string().uuid(),
    reason: z.string().max(300).optional(),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Forgetting",
  async run(input) {
    const db = getDb();
    await db
      .update(memories)
      .set({ status: "archived", pinned: false, updatedAt: new Date() })
      .where(eq(memories.id, input.id));
    return { archived: true };
  },
});

export const memorySearch = defineTool({
  name: "memory_search",
  description:
    "Search stored memories using full-text search. Use this before asking the user to repeat something.",
  schema: z.object({
    query: z.string().min(2).max(200),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Searching memory",
  async run(input) {
    const db = getDb();
    const rows = await db.execute(sql`
      select id, scope, kind, content, importance, pinned
      from memories
      where status = 'active'
        and (
          content_tsv @@ websearch_to_tsquery('english', ${input.query})
          or content ilike ${"%" + input.query + "%"}
        )
      order by
        ts_rank(content_tsv, websearch_to_tsquery('english', ${input.query})) desc,
        importance desc,
        updated_at desc
      limit ${input.limit}
    `);
    return { results: Array.from(rows as unknown as any[]) };
  },
});

export const memoryList = defineTool({
  name: "memory_list",
  description: "List core (pinned) memories and pending proposals.",
  schema: z.object({
    scope: z.enum(["all", "agent", "user"]).default("all"),
  }),
  risk: "safe",
  toolsets: ["memory"],
  label: "Reading memory",
  async run(input) {
    const db = getDb();
    const rows = await db
      .select({
        id: memories.id,
        scope: memories.scope,
        kind: memories.kind,
        content: memories.content,
        pinned: memories.pinned,
        status: memories.status,
      })
      .from(memories)
      .where(
        input.scope === "all"
          ? sql`${memories.status} in ('active','pending')`
          : and(
              sql`${memories.status} in ('active','pending')`,
              eq(memories.scope, input.scope),
            ),
      )
      .orderBy(desc(memories.pinned), desc(memories.updatedAt))
      .limit(80);
    return { memories: rows };
  },
});
