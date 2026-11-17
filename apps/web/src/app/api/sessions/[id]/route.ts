import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, sessions } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const db = getDb();
  await db.update(sessions).set(patch).where(eq(sessions.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, id));
  return NextResponse.json({ ok: true });
}
