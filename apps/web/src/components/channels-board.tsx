"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, MessageCircle } from "lucide-react";
import type { ChannelDescriptions } from "@/lib/channels";

type ChannelForm = {
  token: string;
  webhookSecret: string;
  allowedIds: string;
  applicationId: string;
  publicKey: string;
  testChatId: string;
};

const EMPTY_CHANNEL_FORM: ChannelForm = {
  token: "",
  webhookSecret: "",
  allowedIds: "",
  applicationId: "",
  publicKey: "",
  testChatId: "",
};

/**
 * Telegram and Discord setup. Shared by the dedicated /channels page and the
 * Settings panel so both stay in sync.
 */
export function ChannelsBoard({ channels }: { channels: ChannelDescriptions }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [channelForm, setChannelForm] = useState<Record<"telegram" | "discord", ChannelForm>>({
    telegram: {
      ...EMPTY_CHANNEL_FORM,
      allowedIds: channels.telegram.allowedIds,
    },
    discord: {
      ...EMPTY_CHANNEL_FORM,
      applicationId: channels.discord.applicationId,
      publicKey: channels.discord.publicKey,
      allowedIds: channels.discord.allowedIds,
    },
  });

  function flash(message: string) {
    setNotice(message);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  }

  function patchChannel(channel: "telegram" | "discord", patch: Partial<ChannelForm>) {
    setChannelForm((prev) => ({ ...prev, [channel]: { ...prev[channel], ...patch } }));
  }

  async function channelRequest(
    channel: "telegram" | "discord",
    action: "save" | "register" | "test",
  ) {
    setBusy(`${channel}:${action}`);
    setError(null);
    setNotice(null);
    const form = channelForm[channel];

    const payload: Record<string, unknown> = {
      channel,
      action,
      allowedIds: form.allowedIds,
      testChatId: form.testChatId.trim(),
    };
    if (form.token.trim()) payload.token = form.token.trim();
    if (channel === "telegram") {
      if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
    } else {
      payload.applicationId = form.applicationId.trim();
      payload.publicKey = form.publicKey.trim();
    }

    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? json.detail ?? "That did not work.");
      } else {
        flash(json.detail ?? (action === "save" ? "Channel saved." : "Done."));
        if (action === "save") {
          patchChannel(channel, { token: "", webhookSecret: "", testChatId: "" });
          router.refresh();
        }
      }
    } finally {
      setBusy(null);
    }
  }

  /** Telegram's secret_token accepts A-Za-z0-9_-; hex is the simplest fit. */
  function generateWebhookSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    patchChannel("telegram", { webhookSecret: hex });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-[0.8rem] text-[var(--danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-[12px] border border-[var(--hairline)] bg-[var(--mint)] px-4 py-2.5 text-[0.8rem] text-[var(--mint-ink)]">
          <Check className="h-3.5 w-3.5" /> {notice}
        </div>
      )}

      <div className="card p-5">
        <p className="text-[0.84rem] font-medium">Chat channels</p>
        <p className="mt-1 max-w-[560px] text-[0.74rem] leading-relaxed text-[var(--ink-muted)]">
          Talk to the same agent from Telegram or Discord. Tokens are encrypted with your
          MASTER_KEY and stored in the database, so rotating one does not need a redeploy.
          Environment variables still work as a fallback for existing deployments.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-3)]">
              <MessageCircle className="h-4 w-4" />
            </span>
            <p className="text-[0.84rem] font-medium">Telegram</p>
            {channels.telegram.configured ? (
              <span className="chip chip-ok">connected</span>
            ) : (
              <span className="chip">not connected</span>
            )}
            {channels.telegram.envToken && !channels.telegram.hasToken && (
              <span className="chip chip-butter">from env</span>
            )}
          </div>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="text-[0.72rem] text-[var(--ink-muted)] underline decoration-dotted"
          >
            Create a bot
          </a>
        </div>

        <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
          Message <span className="font-mono">@BotFather</span> →{" "}
          <span className="font-mono">/newbot</span>, paste the token here, then register the
          webhook. Find your numeric user ID with <span className="font-mono">@userinfobot</span> —
          only that ID is answered.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Bot token
            </label>
            <input
              type="password"
              value={channelForm.telegram.token}
              onChange={(e) => patchChannel("telegram", { token: e.target.value })}
              placeholder={
                channels.telegram.hasToken
                  ? `${channels.telegram.tokenHint} saved — leave blank to keep`
                  : "123456789:AA..."
              }
              className="input font-mono text-[0.78rem]"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Webhook secret
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={channelForm.telegram.webhookSecret}
                onChange={(e) => patchChannel("telegram", { webhookSecret: e.target.value })}
                placeholder={
                  channels.telegram.hasWebhookSecret
                    ? "saved — leave blank to keep"
                    : "Generate one"
                }
                className="input font-mono text-[0.78rem]"
                autoComplete="off"
              />
              <button type="button" onClick={generateWebhookSecret} className="btn btn-sm shrink-0">
                Generate
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Allowed user IDs
            </label>
            <input
              value={channelForm.telegram.allowedIds}
              onChange={(e) => patchChannel("telegram", { allowedIds: e.target.value })}
              placeholder="123456789, 987654321"
              className="input font-mono text-[0.78rem]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Send test to
            </label>
            <input
              value={channelForm.telegram.testChatId}
              onChange={(e) => patchChannel("telegram", { testChatId: e.target.value })}
              placeholder={channels.telegram.allowedIds || "Defaults to the first user ID"}
              className="input font-mono text-[0.78rem]"
            />
          </div>
        </div>

        <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--ink-faint)]">
          Webhook URL: <span className="font-mono break-all">{channels.telegram.webhookUrl}</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => channelRequest("telegram", "save")}
            disabled={busy === "telegram:save"}
            className="btn btn-primary btn-sm"
          >
            {busy === "telegram:save" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          <button
            onClick={() => channelRequest("telegram", "register")}
            disabled={busy === "telegram:register"}
            className="btn btn-sm"
          >
            {busy === "telegram:register" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Register webhook
          </button>
          <button
            onClick={() => channelRequest("telegram", "test")}
            disabled={busy === "telegram:test"}
            className="btn btn-sm"
          >
            {busy === "telegram:test" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Send test
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-3)]">
              <MessageCircle className="h-4 w-4" />
            </span>
            <p className="text-[0.84rem] font-medium">Discord</p>
            {channels.discord.configured ? (
              <span className="chip chip-ok">connected</span>
            ) : (
              <span className="chip">not connected</span>
            )}
            {channels.discord.envToken && !channels.discord.hasToken && (
              <span className="chip chip-butter">from env</span>
            )}
          </div>
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noreferrer"
            className="text-[0.72rem] text-[var(--ink-muted)] underline decoration-dotted"
          >
            Developer portal
          </a>
        </div>

        <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
          Create an application → Bot → copy the token. Copy the Public Key from General
          Information and paste the Interactions Endpoint URL there too. Invite the bot to your
          server with the <span className="font-mono">bot</span> and{" "}
          <span className="font-mono">applications.commands</span> scopes, then register{" "}
          <span className="font-mono">/ask</span> below.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Bot token
            </label>
            <input
              type="password"
              value={channelForm.discord.token}
              onChange={(e) => patchChannel("discord", { token: e.target.value })}
              placeholder={
                channels.discord.hasToken
                  ? `${channels.discord.tokenHint} saved — leave blank to keep`
                  : "MTM..."
              }
              className="input font-mono text-[0.78rem]"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Application ID
            </label>
            <input
              value={channelForm.discord.applicationId}
              onChange={(e) => patchChannel("discord", { applicationId: e.target.value })}
              placeholder="Derived from the token if left blank"
              className="input font-mono text-[0.78rem]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Public key
            </label>
            <input
              value={channelForm.discord.publicKey}
              onChange={(e) => patchChannel("discord", { publicKey: e.target.value })}
              placeholder={
                channels.discord.hasPublicKey ? "Saved — edit to replace" : "64-character hex key"
              }
              className="input font-mono text-[0.78rem]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Allowed user IDs
            </label>
            <input
              value={channelForm.discord.allowedIds}
              onChange={(e) => patchChannel("discord", { allowedIds: e.target.value })}
              placeholder="Your Discord user ID"
              className="input font-mono text-[0.78rem]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Test channel ID
            </label>
            <input
              value={channelForm.discord.testChatId}
              onChange={(e) => patchChannel("discord", { testChatId: e.target.value })}
              placeholder="Channel id for the test message"
              className="input font-mono text-[0.78rem]"
            />
          </div>
        </div>

        <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--ink-faint)]">
          Interactions endpoint:{" "}
          <span className="font-mono break-all">{channels.discord.webhookUrl}</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => channelRequest("discord", "save")}
            disabled={busy === "discord:save"}
            className="btn btn-primary btn-sm"
          >
            {busy === "discord:save" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          <button
            onClick={() => channelRequest("discord", "register")}
            disabled={busy === "discord:register"}
            className="btn btn-sm"
          >
            {busy === "discord:register" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Register /ask
          </button>
          <button
            onClick={() => channelRequest("discord", "test")}
            disabled={busy === "discord:test"}
            className="btn btn-sm"
          >
            {busy === "discord:test" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Send test
          </button>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[0.84rem] font-medium">How delivery works</p>
        <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
          A message to the bot starts a run and the answer comes back in the same chat. Schedules
          can deliver to either channel. When a tool needs approval, the run pauses and Approve /
          Reject buttons are sent to the chat the run came from, so you never need to open this page
          to keep it moving.
        </p>
      </div>
    </div>
  );
}
