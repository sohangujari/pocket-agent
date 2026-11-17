import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, memories, messages, sessions, skills } from "@pocket/db";
import { MEMORY_BUDGETS, localTimeLabel } from "@pocket/shared";
import { serverEnv } from "@pocket/shared/env";
import type { ChatMessage } from "./llm.js";
import { DEFAULT_INSTRUCTIONS, DEFAULT_SOUL, getDefaultTimezone, getSetting } from "./settings.js";

export type BuiltContext = {
  system: string;
  messages: ChatMessage[];
  meta: {
    messageCount: number;
    dropped: number;
    memoryChars: number;
    skillCount: number;
  };
};

function cap(lines: string[], budget: number): { text: string; used: number } {
  let used = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (used + line.length + 1 > budget) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { text: kept.join("\n"), used };
}

export async function buildContext(
  sessionId: string,
  opts: { maxHistoryChars?: number } = {},
): Promise<BuiltContext> {
  const db = getDb();
  const maxHistoryChars = opts.maxHistoryChars ?? 90_000;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw new Error("Session not found");

  const pinned = await db
    .select()
    .from(memories)
    .where(and(eq(memories.status, "active"), eq(memories.pinned, true)))
    .orderBy(desc(memories.importance), desc(memories.updatedAt));

  const skillRows = await db
    .select({ slug: skills.slug, name: skills.name, description: skills.description })
    .from(skills)
    .where(and(eq(skills.enabled, true), eq(skills.status, "active")))
    .orderBy(asc(skills.name));

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.seq))
    .limit(160);

  rows.reverse();

  const agentLines = pinned
    .filter((m) => m.scope === "agent")
    .map((m) => `- ${m.content}`);
  const userLines = pinned
    .filter((m) => m.scope === "user")
    .map((m) => `- ${m.content}`);

  const agentMemory = cap(agentLines, MEMORY_BUDGETS.agent);
  const userMemory = cap(userLines, MEMORY_BUDGETS.user);

  const soul = await getSetting("soul", DEFAULT_SOUL);
  const instructions = await getSetting("instructions", DEFAULT_INSTRUCTIONS);
  const agentName = await getSetting("agent_name", serverEnv.agentName);

  // Trim history from the oldest end, never starting on an orphaned tool result.
  let total = 0;
  let cut = rows.length;
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i];
    const size =
      (m.content?.length ?? 0) + (m.toolCalls ? JSON.stringify(m.toolCalls).length : 0) + 40;
    if (total + size > maxHistoryChars) break;
    total += size;
    cut = i;
  }
  while (cut < rows.length && rows[cut].role === "tool") cut++;
  const kept = rows.slice(cut);
  const dropped = rows.length - kept.length;

  const history: ChatMessage[] = kept.map((m) => {
    const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content ?? null };
    if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      msg.tool_calls = m.toolCalls as ChatMessage["tool_calls"];
    }
    if (m.toolCallId) msg.tool_call_id = m.toolCallId;
    if (m.name) msg.name = m.name;
    return msg;
  });

  const skillIndex =
    skillRows.length === 0
      ? "_No skills yet. Create one with skill_create when you work out a repeatable procedure._"
      : skillRows.map((s) => `- ${s.slug} — ${s.description}`).join("\n");

  const timezone = await getDefaultTimezone();

  const system = [
    soul,
    "",
    `Your name is ${agentName}. You are running server-side for one owner.`,
    `Current time: ${localTimeLabel(new Date(), timezone)} (${timezone}). Use this whenever the user says "today", "tonight", "in an hour" or gives a clock time. For a one-time reminder, call schedule_create with when="YYYY-MM-DD HH:MM" in that timezone.`,
    "",
    "## Core memory — the user",
    userMemory.text || "_Nothing yet._",
    "",
    "## Core memory — what you have learned",
    agentMemory.text || "_Nothing yet._",
    "",
    "## Skills available",
    "These are names and descriptions only. Call `skill_view` to load a skill's full procedure before following it.",
    skillIndex,
    "",
    session.summary ? `## Conversation so far\n${session.summary}` : "",
    "",
    "## Operating rules",
    instructions,
  ]
    .filter((part) => part !== "")
    .join("\n");

  return {
    system,
    messages: history,
    meta: {
      messageCount: history.length,
      dropped,
      memoryChars: agentMemory.used + userMemory.used,
      skillCount: skillRows.length,
    },
  };
}

export function systemMessage(context: BuiltContext): ChatMessage {
  return { role: "system", content: context.system };
}
