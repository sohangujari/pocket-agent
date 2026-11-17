import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { artifacts, getDb } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const url = new URL(request.url);
  const inline = url.searchParams.get("inline") === "1";
  const content = row.content ?? "";

  const safeName = row.name.replace(/["\\\r\n]/g, "_");

  return new Response(content, {
    headers: {
      "content-type": row.mime || "text/plain; charset=utf-8",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "cache-control": "private, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  await db.delete(artifacts).where(eq(artifacts.id, id));
  return NextResponse.json({ ok: true });
}
