import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, providerConfigs } from "@pocket/db";
import { PROVIDER_MAP } from "@pocket/shared";
import { serverEnv } from "@pocket/shared/env";
import { encryptSecret } from "@pocket/shared/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    enabled?: boolean;
    clearKey?: boolean;
  };

  const provider = body.provider ?? "";
  if (!PROVIDER_MAP[provider]) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  if (provider === "custom" && !body.baseUrl?.trim()) {
    return NextResponse.json(
      { error: "A base URL is required for a custom OpenAI-compatible provider." },
      { status: 400 },
    );
  }

  const master = serverEnv.masterKey;
  let encryptedKey: string | null = null;

  if (body.apiKey && body.apiKey.trim()) {
    if (!master) {
      return NextResponse.json(
        { error: "MASTER_KEY (or AUTH_SECRET) is required to store provider keys." },
        { status: 500 },
      );
    }
    encryptedKey = encryptSecret(body.apiKey.trim(), master);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.provider, provider))
    .limit(1);

  const baseUrl = body.baseUrl?.trim().replace(/\/+$/, "") || PROVIDER_MAP[provider].baseUrl || null;
  // Saving a key means the provider should be usable: enable it automatically.
  const enabled = body.apiKey?.trim() ? true : (body.enabled ?? existing?.enabled ?? true);

  if (existing) {
    await db
      .update(providerConfigs)
      .set({
        baseUrl,
        enabled,
        encryptedKey: body.clearKey ? null : (encryptedKey ?? existing.encryptedKey),
        updatedAt: new Date(),
      })
      .where(eq(providerConfigs.provider, provider));
  } else {
    await db.insert(providerConfigs).values({
      provider,
      baseUrl,
      enabled,
      encryptedKey,
    });
  }

  return NextResponse.json({ ok: true, hasKey: Boolean(encryptedKey ?? existing?.encryptedKey) });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider is required" }, { status: 400 });

  const db = getDb();
  await db.delete(providerConfigs).where(eq(providerConfigs.provider, provider));
  return NextResponse.json({ ok: true });
}
