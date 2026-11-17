import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, runEvents, runs } from "@pocket/db";
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
  const url = new URL(request.url);
  let after = Number(url.searchParams.get("after") ?? 0);
  if (!Number.isFinite(after) || after < 0) after = 0;

  const db = getDb();
  const [run] = await db
    .select({ status: runs.status, error: runs.error })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: { message: "Run not found." } }, { status: 404 });
  }

  const events = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, id), gt(runEvents.id, after)))
    .orderBy(asc(runEvents.id))
    .limit(500);

  return NextResponse.json({
    status: run.status,
    error: run.error,
    cursor: events.length > 0 ? events[events.length - 1].id : after,
    events: events.map((e) => ({ id: e.id, type: e.type, payload: e.payload })),
  });
}
