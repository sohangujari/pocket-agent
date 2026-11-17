import { sql } from "drizzle-orm";
import { getDb } from "@pocket/db";
import { z } from "zod";
import { defineTool } from "./helpers.js";

export const sessionSearch = defineTool({
  name: "session_search",
  description:
    "Search past conversations with full-text search. Use this when the user refers to something discussed before that is not in the current context.",
  schema: z.object({
    query: z.string().min(2).max(200),
    limit: z.number().int().min(1).max(20).default(6),
  }),
  risk: "safe",
  toolsets: ["sessions"],
  label: "Searching past sessions",
  async run(input) {
    const db = getDb();
    const rows = await db.execute(sql`
      select
        m.session_id as "sessionId",
        s.title,
        m.role,
        m.created_at as "createdAt",
        ts_headline(
          'english',
          coalesce(m.content, ''),
          websearch_to_tsquery('english', ${input.query}),
          'MaxFragments=2, MaxWords=35, MinWords=8'
        ) as snippet
      from messages m
      join sessions s on s.id = m.session_id
      where m.content_tsv @@ websearch_to_tsquery('english', ${input.query})
      order by m.created_at desc
      limit ${input.limit}
    `);

    return {
      results: Array.from(rows as unknown as any[]),
      hint: "Use the sessionId to reference the conversation; the full transcript is not loaded automatically.",
    };
  },
});
