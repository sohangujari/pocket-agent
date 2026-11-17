import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  apiKeys,
  getDb,
  modelRoles,
  providerConfigs,
  settings,
} from "@pocket/db";
import { DEFAULT_MODELS, MODEL_ROLES, PROVIDER_MAP, isValidTimeZone } from "@pocket/shared";
import { setSetting } from "@pocket/core";
import { CHANNEL_SETTING_KEY } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings are returned wholesale so the UI can read whatever it needs, but
 * anything secret must never leave the server. The owner password hash is the
 * one credential stored here; keep the pattern broad so future secrets are
 * covered by default.
 */
const SECRET_SETTING_KEY = /(^|_)(password|passwd|secret|token|hash|api_key)(_|$)/i;

/** Values that are not named like secrets but still contain credentials. */
const SECRET_SETTING_KEYS = new Set([CHANNEL_SETTING_KEY]);

function isSecret(key: string): boolean {
  return SECRET_SETTING_KEY.test(key) || SECRET_SETTING_KEYS.has(key);
}

export async function GET() {
  const db = getDb();

  const settingRows = await db.select().from(settings);
  const models = await db.select().from(modelRoles);
  const providers = await db.select().from(providerConfigs);
  const keys = await db
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

  return NextResponse.json({
    settings: Object.fromEntries(
      settingRows
        .filter((row) => !isSecret(row.key))
        .map((row) => [row.key, row.value]),
    ),
    models,
    providers: providers.map((p) => ({
      provider: p.provider,
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      hasKey: Boolean(p.encryptedKey),
      label: PROVIDER_MAP[p.provider]?.label ?? p.provider,
    })),
    keys,
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    owner_name?: string;
    agent_name?: string;
    default_timezone?: string;
    soul?: string;
    instructions?: string;
    models?: { role: string; provider: string; model: string; fallback?: { provider: string; model: string }[] }[];
  };

  const db = getDb();

  if (typeof body.agent_name === "string" && body.agent_name.trim()) {
    await setSetting("agent_name", body.agent_name.trim().slice(0, 60));
  }
  if (typeof body.owner_name === "string" && body.owner_name.trim()) {
    await setSetting("owner_name", body.owner_name.trim().slice(0, 60));
  }
  if (typeof body.default_timezone === "string") {
    const timezone = body.default_timezone.trim();
    if (!isValidTimeZone(timezone)) {
      return NextResponse.json(
        { error: `"${timezone}" is not a valid IANA timezone. Try Asia/Kolkata.` },
        { status: 400 },
      );
    }
    await setSetting("default_timezone", timezone);
  }
  if (typeof body.soul === "string" && body.soul.trim()) {
    await setSetting("soul", body.soul.trim().slice(0, 8000));
  }
  if (typeof body.instructions === "string") {
    await setSetting("instructions", body.instructions.trim().slice(0, 8000));
  }

  if (Array.isArray(body.models)) {
    for (const entry of body.models) {
      if (!MODEL_ROLES.some((r) => r.id === entry.role)) continue;
      if (!entry.provider || !entry.model) continue;
      await db
        .insert(modelRoles)
        .values({
          role: entry.role,
          provider: entry.provider,
          model: entry.model,
          fallback: entry.fallback ?? [],
        })
        .onConflictDoUpdate({
          target: modelRoles.role,
          set: {
            provider: entry.provider,
            model: entry.model,
            fallback: entry.fallback ?? [],
            updatedAt: new Date(),
          },
        });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "reset_models";
  };

  if (body.action === "reset_models") {
    const db = getDb();
    for (const role of MODEL_ROLES) {
      const ref = DEFAULT_MODELS[role.id];
      await db
        .update(modelRoles)
        .set({ provider: ref.provider, model: ref.model, fallback: [], updatedAt: new Date() })
        .where(eq(modelRoles.role, role.id));
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
