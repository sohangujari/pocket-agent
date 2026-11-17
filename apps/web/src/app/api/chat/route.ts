import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { serverEnv } from "@pocket/shared/env";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    message?: string;
    source?: string;
  };

  const text = (body.message ?? "").trim();
  if (!text) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (text.length > 24_000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
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
      .values({ title: "New session", source: body.source ?? "web" })
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
      source: body.source ?? "web",
    })
    .returning({ id: runs.id });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  kickWorker();

  return NextResponse.json({ runId: run.id, sessionId });
}
