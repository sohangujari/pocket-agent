import { asc, eq } from "drizzle-orm";
import { getDb, messages } from "@pocket/db";

export type UITool = {
  id: string;
  name: string;
  args: unknown;
  result?: string;
  ok?: boolean;
  durationMs?: number;
  risk?: string;
};

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: UITool[];
  createdAt: string;
};

function parseArgs(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Rebuild a chat transcript, attaching tool results to their calls. */
export async function loadChat(sessionId: string): Promise<UIMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq));

  const out: UIMessage[] = [];
  const toolIndex = new Map<string, UITool>();

  for (const row of rows) {
    if (row.role === "user") {
      out.push({
        id: row.id,
        role: "user",
        content: row.content ?? "",
        tools: [],
        createdAt: row.createdAt.toISOString(),
      });
    } else if (row.role === "assistant") {
      const calls = Array.isArray(row.toolCalls) ? (row.toolCalls as any[]) : [];
      const tools: UITool[] = calls.map((call) => ({
        id: call.id ?? `tool-${Math.random()}`,
        name: call.function?.name ?? "tool",
        args: parseArgs(call.function?.arguments),
      }));
      out.push({
        id: row.id,
        role: "assistant",
        content: row.content ?? "",
        tools,
        createdAt: row.createdAt.toISOString(),
      });
      for (const tool of tools) toolIndex.set(tool.id, tool);
    } else if (row.role === "tool" && row.toolCallId) {
      const tool = toolIndex.get(row.toolCallId);
      if (tool) {
        tool.result = row.content ?? "";
        tool.ok = !/^(error:|the user rejected)/i.test(tool.result.trim());
      }
    }
  }

  return out;
}
