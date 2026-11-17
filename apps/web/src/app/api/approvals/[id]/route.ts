import { NextResponse, type NextRequest } from "next/server";
import type { ApprovalDecision } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    decision?: ApprovalDecision;
    note?: string;
  };

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
  }

  const result = await decideApproval(id, body.decision, body.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ ok: true });
}
