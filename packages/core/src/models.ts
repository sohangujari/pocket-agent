import { eq } from "drizzle-orm";
import { getDb, modelRoles, providerConfigs } from "@pocket/db";
import {
  DEFAULT_MODELS,
  PROVIDER_MAP,
  parseModelRef,
  type ModelRef,
  type ModelRole,
} from "@pocket/shared";
import { providerKeyEnv, serverEnv } from "@pocket/shared/env";
import { decryptSecret } from "@pocket/shared/crypto";

export type ResolvedModel = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  label: string;
};

const ENV_FOR_ROLE: Record<ModelRole, string> = {
  main: "LLM_MAIN",
  fast: "LLM_FAST",
  summary: "LLM_SUMMARY",
  vision: "LLM_VISION",
  review: "LLM_REVIEW",
  embedding: "LLM_EMBEDDING",
};

async function providerCredentials(ref: ModelRef): Promise<{ baseUrl: string; apiKey: string } | null> {
  const db = getDb();
  const [cfg] = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.provider, ref.provider))
    .limit(1);

  if (cfg && cfg.enabled === false) return null;

  const preset = PROVIDER_MAP[ref.provider];
  const baseUrl = (cfg?.baseUrl || preset?.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) return null;

  let apiKey = providerKeyEnv(ref.provider) ?? "";
  if (cfg?.encryptedKey) {
    const master = serverEnv.masterKey;
    if (master) {
      try {
        apiKey = decryptSecret(cfg.encryptedKey, master);
      } catch {
        /* fall back to env key */
      }
    }
  }

  // Local / self-hosted endpoints often need no key at all.
  if (!apiKey && ref.provider !== "custom") return null;
  if (!apiKey) apiKey = "not-needed";

  return { baseUrl, apiKey };
}

/**
 * Resolve the ordered fallback chain for a model role:
 *   database config → environment variable → built-in default.
 * Unusable providers (no key, disabled, no base URL) are dropped.
 */
export async function resolveModels(role: ModelRole): Promise<ResolvedModel[]> {
  const db = getDb();
  let refs: ModelRef[] = [];

  const [row] = await db.select().from(modelRoles).where(eq(modelRoles.role, role)).limit(1);
  if (row) {
    refs.push({ provider: row.provider as ModelRef["provider"], model: row.model });
    for (const f of row.fallback ?? []) {
      if (f?.provider && f?.model) {
        refs.push({ provider: f.provider as ModelRef["provider"], model: f.model });
      }
    }
  } else {
    const fromEnv = parseModelRef(process.env[ENV_FOR_ROLE[role]]);
    refs.push(fromEnv ?? DEFAULT_MODELS[role]);
  }

  // de-duplicate
  const seen = new Set<string>();
  refs = refs.filter((r) => {
    const key = `${r.provider}:${r.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const resolved: ResolvedModel[] = [];
  for (const ref of refs) {
    const creds = await providerCredentials(ref);
    if (!creds) continue;
    resolved.push({
      provider: ref.provider,
      model: ref.model,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      label: `${PROVIDER_MAP[ref.provider]?.label ?? ref.provider} · ${ref.model}`,
    });
  }
  return resolved;
}

export class NoModelConfiguredError extends Error {
  constructor(role: ModelRole) {
    super(
      `No usable model is configured for the "${role}" role. Add a provider key in Settings → Models.`,
    );
    this.name = "NoModelConfiguredError";
  }
}

export async function resolveModel(role: ModelRole): Promise<ResolvedModel> {
  const chain = await resolveModels(role);
  if (chain.length === 0) throw new NoModelConfiguredError(role);
  return chain[0];
}

export async function listModelRoles() {
  const db = getDb();
  return db.select().from(modelRoles);
}
