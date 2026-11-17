import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { approvals, getDb, runEvents, runs, sessions } from "@pocket/db";
import { ChatView } from "@/components/chat-view";
import { loadChat } from "@/lib/chat";

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) notFound();

  const messages = await loadChat(id);

  const [activeRun] = await db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.sessionId, id),
        inArray(runs.status, ["queued", "running", "awaiting_approval"]),
      ),
    )
    .orderBy(desc(runs.createdAt))
    .limit(1);

  let cursor = 0;
  let approval = null as null | {
    approvalId: string;
    toolCallId: string;
    name: string;
    args: unknown;
    risk: string;
  };

  if (activeRun) {
    const [row] = await db
      .select({ max: sql<number>`coalesce(max(${runEvents.id}), 0)` })
      .from(runEvents)
      .where(eq(runEvents.runId, activeRun.id));
    cursor = Number(row?.max ?? 0);

    const [pending] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.runId, activeRun.id), eq(approvals.decision, "pending")))
      .limit(1);

    if (pending) {
      approval = {
        approvalId: pending.id,
        toolCallId: pending.toolCallId,
        name: pending.toolName,
        args: pending.input,
        risk: pending.risk,
      };
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <ChatView
      sessionId={id}
      initialTitle={session.title}
      initialMessages={messages}
      initialRunId={activeRun?.id}
      initialCursor={cursor}
      initialAssistantId={lastAssistant?.id}
      initialApproval={approval}
    />
  );
}
