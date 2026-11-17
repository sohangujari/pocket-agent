import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { serverEnv } from "@pocket/shared/env";
import { authenticateApiKey, hasScope, unauthorized } from "@/lib/api-key";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A pragmatic OpenAI-compatible endpoint: it runs the agent synchronously for
 * up to ~45 seconds and returns the final assistant message. Longer tasks keep
 * running on the server; the response then includes `run_id` so the client can
 * poll /api/v1/runs/:id.
 */
export async function POST(request: NextRequest) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "run")) {
    return NextResponse.json({ error: { message: "Key lacks the run scope." } }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: { role: string; content: string }[];
    message?: string;
    session_id?: string;
    stream?: boolean;
  };

  const lastUser = Array.isArray(body.messages)
    ? [...body.messages].reverse().find((m) => m.role === "user")?.content
    : undefined;
  const text = (body.message ?? lastUser ?? "").trim();

  if (!text) {
    return NextResponse.json(
      { error: { message: "Provide `message` or a messages array with a user turn." } },
      { status: 400 },
    );
  }

  const db = getDb();
  let resolvedSessionId = body.session_id;

  if (resolvedSessionId) {
    const [existing] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, resolvedSessionId))
      .limit(1);
    if (!existing) resolvedSessionId = undefined;
  }

  if (!resolvedSessionId) {
    const [created] = await db
      .insert(sessions)
      .values({ title: "API session", source: "api" })
      .returning({ id: sessions.id });
    resolvedSessionId = created.id;
  }

  const sessionId = resolvedSessionId;
  if (!sessionId) {
    return NextResponse.json({ error: { message: "Could not create a session." } }, { status: 500 });
  }

  await db.insert(messages).values({ sessionId, role: "user", content: text });

  const [run] = await db
    .insert(runs)
    .values({
      sessionId,
      status: "queued",
      input: text,
      maxSteps: serverEnv.maxSteps,
      source: "api",
    })
    .returning({ id: runs.id });

  kickWorker();

  const deadline = Date.now() + 45_000;
  let status = "queued";

  while (Date.now() < deadline) {
    await sleep(700);
    const [row] = await db
      .select({ status: runs.status, error: runs.error })
      .from(runs)
      .where(eq(runs.id, run.id))
      .limit(1);
    if (!row) break;
    status = row.status;
    if (["completed", "failed", "cancelled"].includes(status)) break;
  }

  const [final] = await db
    .select({ content: messages.content })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.seq))
    .limit(1);

  const done = status === "completed";

  return NextResponse.json(
    {
      id: `chatcmpl_${run.id}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "pocket-agent",
      run_id: run.id,
      session_id: sessionId,
      status,
      choices: [
        {
          index: 0,
          finish_reason: done ? "stop" : null,
          message: {
            role: "assistant",
            content: final?.content ?? "",
          },
        },
      ],
    },
    { status: done ? 200 : 202 },
  );
}
