import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { approvals, getDb, runs } from "@pocket/db";
import { authenticateApiKey, hasScope, unauthorized } from "@/lib/api-key";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "run")) {
    return NextResponse.json({ error: { message: "Key lacks the run scope." } }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    decision?: "approved" | "rejected";
    note?: string;
  };

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: { message: "decision must be approved or rejected" } },
      { status: 400 },
    );
  }

  const db = getDb();
  const [row] = await db
    .update(approvals)
    .set({
      decision: body.decision,
      note: body.note?.slice(0, 500) ?? null,
      decidedAt: new Date(),
    })
    .where(eq(approvals.id, id))
    .returning({ runId: approvals.runId });

  if (!row) {
    return NextResponse.json({ error: { message: "Approval not found." } }, { status: 404 });
  }

  await db
    .update(runs)
    .set({ status: "queued", heartbeatAt: new Date() })
    .where(eq(runs.id, row.runId));

  kickWorker();
  return NextResponse.json({ ok: true });
}
