import { getSetting, setSetting } from "@pocket/core";
import { decryptSecret, encryptSecret } from "@pocket/shared/crypto";
import { serverEnv } from "@pocket/shared/env";

/**
 * Chat gateway configuration.
 *
 * Tokens are stored in the `settings` table, encrypted with MASTER_KEY, so the
 * owner can rotate them from the UI instead of editing Render env vars and
 * redeploying. Environment variables remain the fallback: an existing
 * deployment keeps working after upgrading, and env wins only when nothing has
 * been saved through the UI.
 */

export const CHANNEL_SETTING_KEY = "channels";

export type ChannelId = "telegram" | "discord";

type StoredChannel = {
  token?: string;
  webhookSecret?: string;
  applicationId?: string;
  publicKey?: string;
  allowedIds?: string[];
};

type StoredConfig = Partial<Record<ChannelId, StoredChannel>>;

export type ResolvedTelegram = {
  token: string;
  webhookSecret: string;
  allowedIds: number[];
};

export type ResolvedDiscord = {
  token: string;
  applicationId: string;
  publicKey: string;
  allowedIds: string[];
};

export type ResolvedChannels = {
  telegram: ResolvedTelegram;
  discord: ResolvedDiscord;
};

type SecretField = "token" | "webhookSecret";

function decryptField(value: string | undefined): string {
  if (!value) return "";
  if (!value.startsWith("v1.")) return value;
  const master = serverEnv.masterKey;
  if (!master) return "";
  try {
    return decryptSecret(value, master);
  } catch {
    return "";
  }
}

function encryptField(value: string): string {
  const master = serverEnv.masterKey;
  if (!master) throw new Error("MASTER_KEY (or AUTH_SECRET) is required to store channel credentials.");
  return encryptSecret(value, master);
}

async function readStored(): Promise<StoredConfig> {
  try {
    return await getSetting<StoredConfig>(CHANNEL_SETTING_KEY, {});
  } catch {
    return {};
  }
}

/** A bot token's first segment is the base64url-encoded application id. */
export function applicationIdFromToken(token: string): string {
  const segment = token.split(".")[0];
  if (!segment) return "";
  try {
    const decoded = Buffer.from(segment, "base64").toString("utf8");
    return /^\d+$/.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function splitIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Fully resolved runtime config: saved values first, environment second. */
export async function getChannels(): Promise<ResolvedChannels> {
  const stored = await readStored();
  const telegram = stored.telegram ?? {};
  const discord = stored.discord ?? {};

  const telegramToken = decryptField(telegram.token) || serverEnv.telegramToken || "";
  const telegramIds = splitIds(telegram.allowedIds?.join(","))
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const discordToken = decryptField(discord.token) || serverEnv.discordToken || "";
  const discordAppId =
    discord.applicationId || serverEnv.discordApplicationId || applicationIdFromToken(discordToken);

  return {
    telegram: {
      token: telegramToken,
      webhookSecret: decryptField(telegram.webhookSecret) || serverEnv.telegramSecret || "",
      allowedIds: telegramIds.length > 0 ? telegramIds : serverEnv.telegramAllowedIds,
    },
    discord: {
      token: discordToken,
      applicationId: discordAppId,
      publicKey: discord.publicKey || serverEnv.discordPublicKey || "",
      allowedIds:
        (discord.allowedIds ?? []).filter(Boolean).length > 0
          ? (discord.allowedIds ?? []).filter(Boolean)
          : serverEnv.discordAllowedIds,
    },
  };
}

export type ChannelPatch = {
  token?: string;
  webhookSecret?: string;
  applicationId?: string;
  publicKey?: string;
  allowedIds?: string;
  clearToken?: boolean;
  clearWebhookSecret?: boolean;
};

/** Save (or patch) one channel. Blank secret fields leave the saved value alone. */
export async function saveChannel(id: ChannelId, patch: ChannelPatch): Promise<void> {
  const stored = await readStored();
  const current: StoredChannel = { ...(stored[id] ?? {}) };

  const setSecret = (field: SecretField, value: string | undefined, clear?: boolean) => {
    if (clear) {
      delete current[field];
      return;
    }
    if (value && value.trim()) current[field] = encryptField(value.trim());
  };

  setSecret("token", patch.token, patch.clearToken);
  if (id === "telegram") {
    setSecret("webhookSecret", patch.webhookSecret, patch.clearWebhookSecret);
  }

  if (patch.applicationId !== undefined) {
    current.applicationId = patch.applicationId.trim();
  }
  if (patch.publicKey !== undefined) {
    current.publicKey = patch.publicKey.trim();
  }
  if (patch.allowedIds !== undefined) {
    current.allowedIds = splitIds(patch.allowedIds);
  }

  await setSetting(CHANNEL_SETTING_KEY, { ...stored, [id]: current });
}

export type ChannelDescription = {
  configured: boolean;
  hasToken: boolean;
  tokenHint: string;
  hasWebhookSecret: boolean;
  applicationId: string;
  publicKey: string;
  hasPublicKey: boolean;
  allowedIds: string;
  envToken: boolean;
  webhookUrl: string;
};

export type ChannelDescriptions = Record<ChannelId, ChannelDescription>;

/** UI-safe view: masks every secret and never returns a stored token. */
export async function describeChannels(): Promise<ChannelDescriptions> {
  const stored = await readStored();
  const resolved = await getChannels();
  const base = serverEnv.appUrl.replace(/\/+$/, "");

  function tokenHint(token: string): string {
    if (!token) return "";
    return token.length <= 6 ? "••••••" : `••••••${token.slice(-4)}`;
  }

  const telegram = stored.telegram ?? {};
  const discord = stored.discord ?? {};

  return {
    telegram: {
      configured: Boolean(resolved.telegram.token),
      hasToken: Boolean(telegram.token),
      tokenHint: tokenHint(resolved.telegram.token),
      hasWebhookSecret: Boolean(telegram.webhookSecret) || Boolean(serverEnv.telegramSecret),
      applicationId: "",
      publicKey: "",
      hasPublicKey: false,
      allowedIds: (telegram.allowedIds ?? serverEnv.telegramAllowedIds.map(String)).join(", "),
      envToken: Boolean(serverEnv.telegramToken),
      webhookUrl: `${base}/api/telegram/webhook`,
    },
    discord: {
      configured: Boolean(
        resolved.discord.token && resolved.discord.applicationId && resolved.discord.publicKey,
      ),
      hasToken: Boolean(discord.token),
      tokenHint: tokenHint(resolved.discord.token),
      hasWebhookSecret: false,
      applicationId: resolved.discord.applicationId,
      publicKey: resolved.discord.publicKey,
      hasPublicKey: Boolean(resolved.discord.publicKey),
      allowedIds: (discord.allowedIds ?? serverEnv.discordAllowedIds).join(", "),
      envToken: Boolean(serverEnv.discordToken),
      webhookUrl: `${base}/api/discord/interactions`,
    },
  };
}
