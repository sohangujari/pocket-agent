import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  doublePrecision,
  bigserial,
  vector,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Identity & configuration                                            */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("owner"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  liteMode: boolean("lite_mode").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerConfigs = pgTable("provider_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().unique(),
  baseUrl: text("base_url"),
  encryptedKey: text("encrypted_key"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelRoles = pgTable("model_roles", {
  role: text("role").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  fallback: jsonb("fallback").$type<{ provider: string; model: string }[]>().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hash: text("hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(["run", "read"]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default("New session"),
    summary: text("summary"),
    source: text("source").notNull().default("web"),
    tokenCount: integer("token_count").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    telegramChatId: text("telegram_chat_id"),
    // Opaque per-chat key for gateways that are not Telegram, e.g. "discord:<channel>:<user>".
    channelChatId: text("channel_chat_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_updated_idx").on(t.updatedAt),
    index("sessions_channel_chat_idx").on(t.channelChatId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    role: text("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<unknown[]>(),
    toolCallId: text("tool_call_id"),
    name: text("name"),
    parts: jsonb("parts").$type<unknown[]>(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_session_seq_idx").on(t.sessionId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Runs & observability                                                */
/* ------------------------------------------------------------------ */

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    parentRunId: uuid("parent_run_id"),
    status: text("status").notNull().default("queued"),
    input: text("input"),
    step: integer("step").notNull().default(0),
    maxSteps: integer("max_steps").notNull().default(24),
    tokensUsed: integer("tokens_used").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    checkpoint: jsonb("checkpoint"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    source: text("source").notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_status_idx").on(t.status), index("runs_session_idx").on(t.sessionId)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.id)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    risk: text("risk").notNull(),
    input: jsonb("input"),
    decision: text("decision").notNull().default("pending"),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_run_idx").on(t.runId)],
);

export const usageLedger = pgTable("usage_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  role: text("role").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  ip: text("ip"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Memory & learning                                                   */
/* ------------------------------------------------------------------ */

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull().default("agent"),
    kind: text("kind").notNull().default("fact"),
    content: text("content").notNull(),
    importance: integer("importance").notNull().default(3),
    pinned: boolean("pinned").notNull().default(false),
    status: text("status").notNull().default("active"),
    embedding: vector("embedding", { dimensions: 1536 }),
    sourceRunId: uuid("source_run_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_status_idx").on(t.status)],
);

export const memoryVersions = pgTable("memory_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryId: uuid("memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  changedBy: text("changed_by").notNull().default("agent"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  bodyMd: text("body_md").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  tools: jsonb("tools").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().default("agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillVersions = pgTable("skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  bodyMd: text("body_md").notNull(),
  changelog: text("changelog"),
  createdBy: text("created_by").notNull().default("agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillUsage = pgTable("skill_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  runId: uuid("run_id"),
  outcome: text("outcome").notNull().default("used"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journeyEvents = pgTable("journey_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  refId: uuid("ref_id"),
  summary: text("summary").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Automation & files                                                  */
/* ------------------------------------------------------------------ */

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  // "cron" for recurring tasks, "once" for a one-time reminder.
  kind: text("kind").notNull().default("cron"),
  cron: text("cron").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  prompt: text("prompt").notNull(),
  toolsets: jsonb("toolsets").$type<string[]>().notNull().default([]),
  skillIds: jsonb("skill_ids").$type<string[]>().notNull().default([]),
  delivery: text("delivery").notNull().default("none"),
  telegramChatId: text("telegram_chat_id"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull().default("text/plain"),
    size: integer("size").notNull().default(0),
    content: text("content"),
    storagePath: text("storage_path"),
    runId: uuid("run_id"),
    kind: text("kind").notNull().default("file"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("artifacts_path_idx").on(t.path)],
);
