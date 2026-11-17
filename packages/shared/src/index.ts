export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "zai"
  | "openrouter"
  | "custom";

export type ModelRole =
  | "main"
  | "fast"
  | "summary"
  | "vision"
  | "review"
  | "embedding";

export type ModelRef = {
  provider: ProviderId;
  model: string;
};

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  keyEnv: string;
  docs: string;
  models: string[];
  note?: string;
};

/**
 * Every provider below speaks the OpenAI chat-completions dialect, so a single
 * client implementation covers all of them. Model names change often — the UI
 * lets you type any model id.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    docs: "https://platform.openai.com/api-keys",
    models: ["gpt-5.1", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    docs: "https://console.anthropic.com/settings/keys",
    models: [
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-haiku-4-5",
      "claude-sonnet-4-20250514",
    ],
    note: "Uses Anthropic's OpenAI-compatible endpoint.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    docs: "https://aistudio.google.com/apikey",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  {
    id: "zai",
    label: "Z.ai (GLM)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    keyEnv: "ZAI_API_KEY",
    docs: "https://z.ai/manage-apikey/apikey-list",
    models: ["glm-4.6", "glm-4.5", "glm-4.5-air"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    docs: "https://openrouter.ai/keys",
    models: [
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-5.1",
      "google/gemini-2.5-flash",
      "z-ai/glm-4.6",
      "deepseek/deepseek-chat",
      "qwen/qwen3-235b-a22b",
    ],
    note: "One key, hundreds of models. Best default for fallback chains.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    keyEnv: "CUSTOM_LLM_API_KEY",
    docs: "",
    models: [],
    note: "Ollama, LM Studio, vLLM, LiteLLM, or any /v1 endpoint.",
  },
];

export const PROVIDER_MAP: Record<string, ProviderPreset> = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.id, p]),
);

export const MODEL_ROLES: { id: ModelRole; label: string; description: string }[] = [
  { id: "main", label: "Main", description: "Reasoning and tool execution." },
  { id: "fast", label: "Fast", description: "Titles, classifications, small jobs." },
  { id: "summary", label: "Compression", description: "Summarises long conversations." },
  { id: "vision", label: "Vision", description: "Reads images and screenshots." },
  { id: "review", label: "Review", description: "Learning loop and self-critique." },
  { id: "embedding", label: "Embeddings", description: "Optional semantic memory." },
];

export const DEFAULT_MODELS: Record<ModelRole, ModelRef> = {
  main: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5" },
  fast: { provider: "openrouter", model: "google/gemini-2.5-flash" },
  summary: { provider: "openrouter", model: "google/gemini-2.5-flash" },
  vision: { provider: "openrouter", model: "google/gemini-2.5-flash" },
  review: { provider: "openrouter", model: "google/gemini-2.5-flash" },
  embedding: { provider: "openai", model: "text-embedding-3-small" },
};

/** "provider:model" → ModelRef. Model ids may contain ":" so split once. */
export function parseModelRef(value: string | undefined | null): ModelRef | null {
  if (!value) return null;
  const i = value.indexOf(":");
  if (i < 1) return null;
  return { provider: value.slice(0, i) as ProviderId, model: value.slice(i + 1) };
}

export function formatModelRef(ref: ModelRef): string {
  return `${ref.provider}:${ref.model}`;
}

export const OWNER_ID = "00000000-0000-0000-0000-000000000001";

export const MEMORY_BUDGETS = {
  agent: 2200,
  user: 1375,
} as const;

export const LIMITS = {
  maxSteps: 24,
  maxRunTokens: 120_000,
  maxToolOutputChars: 16_000,
  maxFileBytes: 512_000,
  maxUploadBytes: 8_000_000,
  maxDelegationDepth: 2,
  maxDelegationConcurrency: 3,
  maxSessionsListed: 200,
} as const;

export * from "./time.js";
