import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, journeyEvents, memories, memoryVersions } from "@pocket/db";
import { MEMORY_BUDGETS } from "@pocket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pinnedChars(scope: "agent" | "user"): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ content: memories.content })
    .from(memories)
    .where(and(eq(memories.status, "active"), eq(memories.pinned, true), eq(memories.scope, scope)));
  return rows.reduce((sum, r) => sum + r.content.length + 3, 0);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    scope?: "agent" | "user";
    kind?: string;
    pin?: boolean;
    reason?: string;
  };

  const content = (body.content ?? "").trim();
  if (content.length < 3 || content.length > 500) {
    return NextResponse.json({ error: "Memory must be 3–500 characters." }, { status: 400 });
  }

  const scope = body.scope === "user" ? "user" : "agent";
  const db = getDb();
  const used = await pinnedChars(scope);
  const pinned = (body.pin ?? true) && used + content.length + 3 <= MEMORY_BUDGETS[scope];

  const [created] = await db
    .insert(memories)
    .values({
      scope,
      kind: body.kind ?? "fact",
      content,
      pinned,
      status: "active",
      reason: body.reason ?? "Added by the owner",
    })
    .returning({ id: memories.id });

  await db.insert(memoryVersions).values({
    memoryId: created.id,
    content,
    changedBy: "user",
    reason: body.reason ?? "Added by the owner",
  });

  await db.insert(journeyEvents).values({
    type: "memory_added",
    refId: created.id,
    summary: content.slice(0, 140),
    meta: { scope, pinned, by: "user" },
  });

  return NextResponse.json({ ok: true, pinned });
}
