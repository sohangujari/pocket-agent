import { NextResponse, type NextRequest } from "next/server";
import { auditLog, getDb } from "@pocket/db";
import { getSession, setDashboardPassword, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
    confirm?: string;
  };

  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";
  const confirm = body.confirm ?? "";

  if (!(await verifyPassword(current))) {
    return NextResponse.json({ error: "Current password is wrong." }, { status: 401 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  }
  if (next !== confirm) {
    return NextResponse.json({ error: "The new passwords do not match." }, { status: 400 });
  }

  await setDashboardPassword(next);

  const db = getDb();
  await db.insert(auditLog).values({
    actor: "owner",
    action: "password_changed",
    target: "dashboard",
  });

  return NextResponse.json({ ok: true });
}
