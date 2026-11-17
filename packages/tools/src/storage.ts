import { serverEnv } from "@pocket/shared/env";

/**
 * Best-effort mirror of an artifact into Supabase Storage.
 * The database always keeps a copy, so this is never required for correctness.
 */
export async function mirrorToStorage(
  path: string,
  content: string,
  mime: string,
): Promise<string | null> {
  const url = serverEnv.supabaseUrl;
  const key = serverEnv.supabaseServiceKey;
  const bucket = serverEnv.supabaseBucket;
  if (!url || !key) return null;

  const clean = path.replace(/^\/+/, "");
  try {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${clean}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": mime,
        "x-upsert": "true",
      },
      body: content,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return clean;
  } catch {
    return null;
  }
}
