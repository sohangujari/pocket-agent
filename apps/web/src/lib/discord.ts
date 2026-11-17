import { createPublicKey, verify } from "node:crypto";
import { getChannels } from "./channels";

/**
 * Discord bot helpers over the v10 REST API.
 *
 * Inbound uses HTTP interactions (no gateway socket), which suits a single
 * Next.js server: Discord signs every request with the application's ed25519
 * key and expects an answer within three seconds. Slow work is deferred and the
 * result is posted back through the interaction token.
 */

const API = "https://discord.com/api/v10";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex: string,
): boolean {
  if (!signatureHex || !timestamp || !publicKeyHex) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  let rest = text || "(empty)";
  while (rest.length > 0) {
    out.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return out;
}

type DiscordResult = { ok: boolean; status: number; body: unknown };

async function api(
  path: string,
  token: string,
  init: { method: string; body?: unknown },
): Promise<DiscordResult> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        ...(token ? { authorization: `Bot ${token}` } : {}),
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) console.error("[discord]", init.method, path, res.status, body);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    console.error("[discord] request failed", init.method, path, error);
    return { ok: false, status: 0, body: null };
  }
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<void> {
  const { token } = (await getChannels()).discord;
  if (!token) return;
  for (const part of chunk(content, 1900)) {
    await api(`/channels/${channelId}/messages`, token, {
      method: "POST",
      body: { content: part },
    });
  }
}

/** Complete a deferred interaction by editing the original response. */
export async function editDiscordOriginal(
  applicationId: string,
  interactionToken: string,
  content: string,
  components?: unknown[],
): Promise<void> {
  const parts = chunk(content, 1900);
  const first = parts.shift() ?? "";
  await api(`/webhooks/${applicationId}/${interactionToken}/messages/@original`, "", {
    method: "PATCH",
    body: { content: first, ...(components ? { components } : {}) },
  });
  for (const part of parts) {
    await api(`/webhooks/${applicationId}/${interactionToken}`, "", {
      method: "POST",
      body: { content: part },
    });
  }
}

/** Follow-up message: useful when the first response was already replaced. */
export async function sendDiscordFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  components?: unknown[],
): Promise<void> {
  const parts = chunk(content, 1900);
  for (const [index, part] of parts.entries()) {
    await api(`/webhooks/${applicationId}/${interactionToken}`, "", {
      method: "POST",
      body: {
        content: part,
        ...(components && index === parts.length - 1 ? { components } : {}),
      },
    });
  }
}

export function approvalComponents(approvalId: string) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Approve",
          custom_id: `pa:approved:${approvalId}`,
        },
        {
          type: 2,
          style: 4,
          label: "Reject",
          custom_id: `pa:rejected:${approvalId}`,
        },
      ],
    },
  ];
}

export const DISCORD_COMMANDS = [
  {
    name: "ask",
    description: "Ask Pocket Agent to do something",
    type: 1,
    options: [
      {
        name: "prompt",
        description: "What should the agent do?",
        type: 3,
        required: true,
        max_length: 1900,
      },
    ],
  },
  {
    name: "new",
    description: "Start a fresh conversation with Pocket Agent",
    type: 1,
  },
];

export async function registerDiscordCommands(
  applicationId: string,
  token: string,
): Promise<{ ok: boolean; detail: string }> {
  const res = await api(`/applications/${applicationId}/commands`, token, {
    method: "PUT",
    body: DISCORD_COMMANDS,
  });
  if (res.ok) return { ok: true, detail: "Registered /ask and /new." };
  return {
    ok: false,
    detail:
      (res.body as { message?: string } | null)?.message ??
      `Discord returned ${res.status || "no response"}.`,
  };
}
