import { eq } from "drizzle-orm";
import { approvals, getDb, runs } from "@pocket/db";
import { kickWorker } from "./worker";

export type ApprovalDecision = "approved" | "rejected";

/**
 * Record a decision and put the paused run back on the queue. Shared by the web
 * UI, the Telegram buttons and the Discord buttons so all three channels decide
 * through exactly the same path.
 */
export async function decideApproval(
  id: string,
  decision: ApprovalDecision,
  note?: string,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const db = getDb();
  const [row] = await db
    .update(approvals)
    .set({
      decision,
      note: note?.slice(0, 500) ?? null,
      decidedAt: new Date(),
    })
    .where(eq(approvals.id, id))
    .returning({ runId: approvals.runId });

  if (!row) return { ok: false, error: "Approval not found." };

  await db
    .update(runs)
    .set({ status: "queued", heartbeatAt: new Date() })
    .where(eq(runs.id, row.runId));

  kickWorker();
  return { ok: true, runId: row.runId };
}
