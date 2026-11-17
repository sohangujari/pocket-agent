import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, journeyEvents, memories, memoryVersions } from "@pocket/db";
import { MEMORY_BUDGETS } from "@pocket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pinnedChars(scope: "agent" | "user", excludeId?: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .where(and(eq(memories.status, "active"), eq(memories.pinned, true), eq(memories.scope, scope)));
  return rows
    .filter((r) => r.id !== excludeId)
    .reduce((sum, r) => sum + r.content.length + 3, 0);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "approve" | "reject" | "pin" | "unpin" | "archive" | "update";
    content?: string;
  };

  const db = getDb();
  const [memory] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
  if (!memory) return NextResponse.json({ error: "Memory not found." }, { status: 404 });

  const scope = memory.scope === "user" ? "user" : "agent";
  const budget = MEMORY_BUDGETS[scope];

  switch (body.action) {
    case "approve": {
      const used = await pinnedChars(scope, id);
      const pinned = used + memory.content.length + 3 <= budget;
      await db
        .update(memories)
        .set({ status: "active", pinned, updatedAt: new Date() })
        .where(eq(memories.id, id));
      await db.insert(journeyEvents).values({
        type: "memory_approved",
        refId: id,
        summary: memory.content.slice(0, 140),
        meta: { scope, pinned },
      });
      return NextResponse.json({ ok: true, pinned });
    }

    case "reject": {
      await db
        .update(memories)
        .set({ status: "rejected", pinned: false, updatedAt: new Date() })
        .where(eq(memories.id, id));
      return NextResponse.json({ ok: true });
    }

    case "pin": {
      const used = await pinnedChars(scope, id);
      if (used + memory.content.length + 3 > budget) {
        return NextResponse.json(
          { error: `Core ${scope} memory is full (${used}/${budget}). Unpin something first.` },
          { status: 409 },
        );
      }
      await db
        .update(memories)
        .set({ pinned: true, status: "active", updatedAt: new Date() })
        .where(eq(memories.id, id));
      return NextResponse.json({ ok: true });
    }

    case "unpin": {
      await db
        .update(memories)
        .set({ pinned: false, updatedAt: new Date() })
        .where(eq(memories.id, id));
      return NextResponse.json({ ok: true });
    }

    case "archive": {
      await db
        .update(memories)
        .set({ status: "archived", pinned: false, updatedAt: new Date() })
        .where(eq(memories.id, id));
      return NextResponse.json({ ok: true });
    }

    case "update": {
      const content = (body.content ?? "").trim();
      if (content.length < 3 || content.length > 500) {
        return NextResponse.json({ error: "Memory must be 3–500 characters." }, { status: 400 });
      }
      await db
        .update(memories)
        .set({ content, updatedAt: new Date() })
        .where(eq(memories.id, id));
      await db.insert(memoryVersions).values({
        memoryId: id,
        content,
        changedBy: "user",
        reason: "Edited by the owner",
      });
      await db.insert(journeyEvents).values({
        type: "memory_updated",
        refId: id,
        summary: content.slice(0, 140),
        meta: { by: "user" },
      });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  await db.delete(memories).where(eq(memories.id, id));
  return NextResponse.json({ ok: true });
}
