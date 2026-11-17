import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { serverEnv } from "@pocket/shared/env";
import { authenticateApiKey, hasScope, unauthorized } from "@/lib/api-key";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "read")) {
    return NextResponse.json({ error: { message: "Key lacks the read scope." } }, { status: 403 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: runs.id,
      sessionId: runs.sessionId,
      status: runs.status,
      input: runs.input,
      step: runs.step,
      tokensUsed: runs.tokensUsed,
      costUsd: runs.costUsd,
      source: runs.source,
      error: runs.error,
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      title: sessions.title,
    })
    .from(runs)
    .leftJoin(sessions, eq(runs.sessionId, sessions.id))
    .orderBy(desc(runs.createdAt))
    .limit(50);

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "run")) {
    return NextResponse.json({ error: { message: "Key lacks the run scope." } }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    sessionId?: string;
    source?: string;
  };

  const text = (body.message ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { error: { message: "`message` is required." } },
      { status: 400 },
    );
  }
  if (text.length > 24_000) {
    return NextResponse.json({ error: { message: "Message is too long." } }, { status: 400 });
  }

  const db = getDb();
  let sessionId = body.sessionId;

  if (sessionId) {
    const [existing] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!existing) sessionId = undefined;
  }

  if (!sessionId) {
    const [created] = await db
      .insert(sessions)
      .values({ title: "CLI session", source: body.source ?? "cli" })
      .returning({ id: sessions.id });
    sessionId = created.id;
  }

  await db.insert(messages).values({ sessionId, role: "user", content: text });

  const [run] = await db
    .insert(runs)
    .values({
      sessionId,
      status: "queued",
      input: text,
      maxSteps: serverEnv.maxSteps,
      source: body.source ?? "cli",
    })
    .returning({ id: runs.id });

  kickWorker();

  return NextResponse.json({ runId: run.id, sessionId }, { status: 202 });
}
