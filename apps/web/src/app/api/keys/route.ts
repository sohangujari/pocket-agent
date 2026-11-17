import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { apiKeys, auditLog, getDb } from "@pocket/db";
import { generateApiKey, sha256 } from "@pocket/shared/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json({ keys: rows });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    scopes?: string[];
  };

  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "Give the key a name." }, { status: 400 });
  }

  const raw = generateApiKey();
  const db = getDb();

  const [created] = await db
    .insert(apiKeys)
    .values({
      name: name.slice(0, 60),
      hash: sha256(raw),
      prefix: raw.slice(0, 10),
      scopes: Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ["run", "read"],
    })
    .returning({ id: apiKeys.id });

  await db.insert(auditLog).values({
    actor: "owner",
    action: "api_key_created",
    target: created.id,
    meta: { name },
  });

  // The raw key is shown exactly once.
  return NextResponse.json({ ok: true, id: created.id, key: raw });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getDb();
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
  await db.insert(auditLog).values({ actor: "owner", action: "api_key_revoked", target: id });
  return NextResponse.json({ ok: true });
}
