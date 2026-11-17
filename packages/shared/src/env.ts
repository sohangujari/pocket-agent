/**
 * Server-side environment access. Never import this from a client component.
 * Values are read lazily so `next build` does not require a live environment.
 */

import { z } from "zod";
import { isValidTimeZone } from "./time.js";

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

/* ------------------------------------------------------------------ *
 * Boot-time validation (PRD v0.2, Phase 0)
 *
 * `next build` never needs a live environment, so validation runs from
 * `instrumentation.ts` at server start instead of at import time. A bad
 * value fails fast with one clear line per problem.
 * ------------------------------------------------------------------ */

const csvIds = z
  .string()
  .optional()
  .refine(
    (value) => !value || value.split(",").every((part) => /^\s*\d*\s*$/.test(part)),
    "must be a comma-separated list of numeric IDs",
  );

const httpUrl = (name: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
      `${name} must be an http(s) URL`,
    );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z
      .string({ error: "DATABASE_URL is required (postgres://user:pass@host:5432/db)" })
      .min(1, "DATABASE_URL is required"),
    AUTH_SECRET: z
      .string({ error: "AUTH_SECRET is required" })
      .min(16, "AUTH_SECRET must be at least 16 characters"),
    MASTER_KEY: z.string().min(16, "MASTER_KEY must be at least 16 characters").optional(),
    CRON_SECRET: z.string().min(8, "CRON_SECRET should be at least 8 characters").optional(),
    APP_URL: httpUrl("APP_URL"),
    DEFAULT_TIMEZONE: z
      .string()
      .optional()
      .refine(
        (value) => !value || isValidTimeZone(value),
        "DEFAULT_TIMEZONE must be an IANA zone such as Asia/Kolkata",
      ),
    MAX_STEPS: z.coerce.number().int().min(1).max(200).optional(),
    MAX_RUN_TOKENS: z.coerce.number().int().min(1_000).optional(),
    DELEGATION_CONCURRENCY: z.coerce.number().int().min(1).max(10).optional(),
    APPROVAL_MODE: z.enum(["dangerous", "writes", "never"]).optional(),
    EXEC_BACKEND: z.enum(["disabled", "local", "e2b"]).optional(),
    SEARCH_PROVIDER: z.enum(["none", "tavily", "brave", "searxng"]).optional(),
    TELEGRAM_ALLOWED_USER_IDS: csvIds,
    DISCORD_ALLOWED_USER_IDS: z.string().optional(),
    LEARNING_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .superRefine((value, ctx) => {
    // Code execution must never run beside MASTER_KEY and DATABASE_URL in a
    // production container (PRD §3.4).
    if (
      value.NODE_ENV === "production" &&
      value.EXEC_BACKEND &&
      value.EXEC_BACKEND !== "disabled" &&
      value.EXEC_BACKEND !== "e2b"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EXEC_BACKEND"],
        message:
          "EXEC_BACKEND=local is refused in production; use disabled or an isolated backend (e2b)",
      });
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid environment:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvValidationError";
    this.problems = problems;
  }
}

/**
 * Validate the process environment. Throws EnvValidationError listing every
 * problem at once. Returns non-fatal warnings for values that only degrade
 * security or reliability.
 */
export function validateEnv(): { env: ValidatedEnv; warnings: string[] } {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => {
        const key = issue.path.join(".") || "environment";
        return `${key}: ${issue.message}`;
      }),
    );
  }

  const warnings: string[] = [];
  const env = parsed.data;
  if (!env.MASTER_KEY) {
    warnings.push(
      "MASTER_KEY is not set; saved provider keys are encrypted with AUTH_SECRET. Set MASTER_KEY and back it up before saving any keys.",
    );
  }
  if (env.NODE_ENV === "production" && !env.MASTER_KEY) {
    warnings.push("Production without MASTER_KEY: rotating AUTH_SECRET will make saved keys unreadable.");
  }
  if (env.NODE_ENV === "production" && !env.CRON_SECRET) {
    warnings.push("CRON_SECRET is not set; /api/cron/tick is unauthenticated.");
  }
  return { env, warnings };
}
