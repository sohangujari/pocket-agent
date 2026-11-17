import { desc } from "drizzle-orm";
import {
  apiKeys,
  getDb,
  modelRoles,
  providerConfigs,
  settings,
} from "@pocket/db";
import { DEFAULT_MODELS, MODEL_ROLES, PROVIDER_MAP } from "@pocket/shared";
import { serverEnv } from "@pocket/shared/env";
import { PageHeader } from "@/components/ui";
import { SettingsPanel, type SettingsData } from "@/components/settings-panel";
import { describeChannels } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();

  const settingRows = await db.select().from(settings);
  const map = Object.fromEntries(settingRows.map((r) => [r.key, r.value as any]));

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

  const data: SettingsData = {
    ownerName: String(map.owner_name ?? serverEnv.ownerName),
    agentName: String(map.agent_name ?? serverEnv.agentName),
    defaultTimezone: String(map.default_timezone ?? serverEnv.defaultTimezone),
    soul: typeof map.soul === "string" ? map.soul : "",
    instructions: typeof map.instructions === "string" ? map.instructions : "",
    models: MODEL_ROLES.map((role) => {
      const row = models.find((m) => m.role === role.id);
      const fallback = DEFAULT_MODELS[role.id];
      return {
        role: role.id,
        label: role.label,
        description: role.description,
        provider: row?.provider ?? fallback.provider,
        model: row?.model ?? fallback.model,
        fallback: (row?.fallback ?? []) as { provider: string; model: string }[],
      };
    }),
    providers: Object.values(PROVIDER_MAP).map((preset) => {
      const row = providers.find((p) => p.provider === preset.id);
      return {
        provider: preset.id,
        label: preset.label,
        baseUrl: row?.baseUrl ?? preset.baseUrl,
        enabled: row?.enabled ?? true,
        hasKey: Boolean(row?.encryptedKey),
        docs: preset.docs,
        models: preset.models,
        note: preset.note ?? null,
        envKey: Boolean(process.env[preset.keyEnv]),
      };
    }),
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
    channels: await describeChannels(),
    env: {
      database: Boolean(serverEnv.databaseUrl),
      authSecret: Boolean(serverEnv.authSecret),
      ownerPassword: Boolean(serverEnv.ownerPassword),
      masterKey: Boolean(serverEnv.masterKey),
      cron: Boolean(serverEnv.cronSecret),
      telegram: Boolean(serverEnv.telegramToken),
      search: serverEnv.searchProvider,
      exec: serverEnv.execBackend,
      approvalMode: serverEnv.approvalMode,
      storage: Boolean(serverEnv.supabaseUrl && serverEnv.supabaseServiceKey),
      appUrl: serverEnv.appUrl,
    },
  };

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Models, provider keys, the agent's soul and API access. Everything here is stored in your database and encrypted at rest where it matters."
      />
      <SettingsPanel data={data} />
    </div>
  );
}
