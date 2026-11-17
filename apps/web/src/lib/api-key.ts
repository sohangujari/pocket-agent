import { eq, sql } from "drizzle-orm";
import { apiKeys, getDb } from "@pocket/db";
import { sha256 } from "@pocket/shared/crypto";

export type ApiKeyContext = {
  id: string;
  name: string;
  scopes: string[];
};

/**
 * Validates `Authorization: Bearer pa_...` and returns the key's scopes.
 * Updates last_used_at at most once a minute to avoid write amplification.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyContext | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(pa_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return null;

  const db = getDb();
  const hash = sha256(match[1]);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hash)).limit(1);
  if (!row) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  }

  return { id: row.id, name: row.name, scopes: (row.scopes ?? []) as string[] };
}

export function hasScope(key: ApiKeyContext, scope: string): boolean {
  return key.scopes.includes(scope) || key.scopes.includes("admin");
}

export function unauthorized(message = "Invalid or missing API key.") {
  return Response.json({ error: { message, type: "invalid_request_error" } }, { status: 401 });
}

export async function nextCursor(runId: string): Promise<number> {
  const db = getDb();
  const rows = (await db.execute(sql`
    select coalesce(max(id), 0)::bigint as max from run_events where run_id = ${runId}
  `)) as unknown as { max: string }[];
  return Number(rows[0]?.max ?? 0);
}
