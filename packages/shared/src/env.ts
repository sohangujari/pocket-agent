/**
 * Server-side environment access. Never import this from a client component.
 * Values are read lazily so `next build` does not require a live environment.
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export const serverEnv = {
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get appUrl() {
    return read("APP_URL") ?? "http://localhost:3000";
  },
  get authSecret() {
    return read("AUTH_SECRET");
  },
  get masterKey() {
    return read("MASTER_KEY") ?? read("AUTH_SECRET");
  },
  get ownerName() {
    return read("OWNER_NAME") ?? "Owner";
  },
  get ownerPassword() {
    return read("OWNER_PASSWORD");
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  get agentName() {
    return read("AGENT_NAME") ?? "Pocket Agent";
  },
  get maxSteps() {
    return Number(read("MAX_STEPS") ?? 24);
  },
  get maxRunTokens() {
    return Number(read("MAX_RUN_TOKENS") ?? 120_000);
  },
  get delegationConcurrency() {
    return Number(read("DELEGATION_CONCURRENCY") ?? 3);
  },
  get learningEnabled() {
    return (read("LEARNING_ENABLED") ?? "true") !== "false";
  },
  get approvalMode() {
    return (read("APPROVAL_MODE") ?? "dangerous") as "dangerous" | "writes" | "never";
  },
  get defaultTimezone() {
    return read("DEFAULT_TIMEZONE") ?? "Asia/Kolkata";
  },
  get execBackend() {
    return (read("EXEC_BACKEND") ?? "disabled") as "disabled" | "local";
  },
  get execAllowlist() {
    return (read("EXEC_ALLOWLIST") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get httpAllowlist() {
    return (read("HTTP_ALLOWLIST") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get searchProvider() {
    return (read("SEARCH_PROVIDER") ?? "none") as "none" | "tavily" | "brave" | "searxng";
  },
  get searchApiKey() {
    return read("SEARCH_API_KEY");
  },
  get searxngUrl() {
    return read("SEARXNG_URL");
  },
  get telegramToken() {
    return read("TELEGRAM_BOT_TOKEN");
  },
  get telegramSecret() {
    return read("TELEGRAM_WEBHOOK_SECRET");
  },
  get telegramAllowedIds() {
    return (read("TELEGRAM_ALLOWED_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));
  },
  get discordToken() {
    return read("DISCORD_BOT_TOKEN");
  },
  get discordPublicKey() {
    return read("DISCORD_PUBLIC_KEY");
  },
  get discordApplicationId() {
    return read("DISCORD_APPLICATION_ID");
  },
  get discordAllowedIds() {
    return (read("DISCORD_ALLOWED_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseBucket() {
    return read("SUPABASE_STORAGE_BUCKET") ?? "pocket-agent";
  },
};

export function providerKeyEnv(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return read("OPENAI_API_KEY");
    case "anthropic":
      return read("ANTHROPIC_API_KEY");
    case "gemini":
      return read("GEMINI_API_KEY");
    case "zai":
      return read("ZAI_API_KEY");
    case "openrouter":
      return read("OPENROUTER_API_KEY");
    case "custom":
      return read("CUSTOM_LLM_API_KEY");
    default:
      return undefined;
  }
}

export function requireEnv(name: string): string {
  const v = read(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
