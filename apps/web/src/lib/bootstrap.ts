import { DEFAULT_MODELS, MODEL_ROLES, OWNER_ID, parseModelRef } from "@pocket/shared";
import { getDb, modelRoles, profiles, settings } from "@pocket/db";
import { serverEnv } from "@pocket/shared/env";

let bootstrapped: Promise<void> | null = null;

async function run(): Promise<void> {
  const db = getDb();

  await db
    .insert(profiles)
    .values({
      id: OWNER_ID,
      // This is a single-owner, name-based profile. No email is collected.
      email: "",
      name: serverEnv.ownerName,
      timezone: serverEnv.defaultTimezone,
    })
    .onConflictDoNothing();

  for (const role of MODEL_ROLES) {
    const envValue = process.env[`LLM_${role.id.toUpperCase()}`];
    const ref = parseModelRef(envValue) ?? DEFAULT_MODELS[role.id];
    await db
      .insert(modelRoles)
      .values({ role: role.id, provider: ref.provider, model: ref.model, fallback: [] })
      .onConflictDoNothing();
  }

  await db
    .insert(settings)
    .values({ key: "agent_name", value: serverEnv.agentName })
    .onConflictDoNothing();
}

/** Idempotent, once-per-process seed of the owner profile and model roles. */
export function ensureBootstrap(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = run().catch((error) => {
      bootstrapped = null;
      throw error;
    });
  }
  return bootstrapped;
}
