import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, messages, runs } from "@pocket/db";
import { authenticateApiKey, hasScope, unauthorized } from "@/lib/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "read")) {
    return NextResponse.json({ error: { message: "Key lacks the read scope." } }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run) {
    return NextResponse.json({ error: { message: "Run not found." } }, { status: 404 });
  }

  const [final] = await db
    .select({ content: messages.content, seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.sessionId, run.sessionId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.seq))
    .limit(1);

  return NextResponse.json({
    id: run.id,
    sessionId: run.sessionId,
    status: run.status,
    step: run.step,
    maxSteps: run.maxSteps,
    tokensUsed: run.tokensUsed,
    costUsd: run.costUsd,
    error: run.error,
    output: final?.content ?? null,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  });
}
