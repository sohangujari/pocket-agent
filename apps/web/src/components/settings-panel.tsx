"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Database,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Plug,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash,
  User,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChannelDescriptions } from "@/lib/channels";
import { ChannelsBoard } from "./channels-board";
import { fmtDate, timeAgo } from "@/lib/format";

export type SettingsData = {
  ownerName: string;
  agentName: string;
  defaultTimezone: string;
  soul: string;
  instructions: string;
  models: {
    role: string;
    label: string;
    description: string;
    provider: string;
    model: string;
    fallback: { provider: string; model: string }[];
  }[];
  providers: {
    provider: string;
    label: string;
    baseUrl: string;
    enabled: boolean;
    hasKey: boolean;
    docs: string;
    models: string[];
    note: string | null;
    envKey: boolean;
  }[];
  keys: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: string | null;
    createdAt: string;
  }[];
  channels: ChannelDescriptions;
  env: {
    database: boolean;
    authSecret: boolean;
    ownerPassword: boolean;
    masterKey: boolean;
    cron: boolean;
    telegram: boolean;
    search: string;
    exec: string;
    approvalMode: string;
    storage: boolean;
    appUrl: string;
  };
};

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "models", label: "Models", icon: Wand2 },
  { id: "providers", label: "Providers", icon: Plug },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "channels", label: "Channels", icon: MessageCircle },
  { id: "system", label: "System", icon: Database },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TIMEZONES = [
  { id: "Asia/Kolkata", label: "India — IST (default)" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "America/New_York", label: "New York" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "America/Denver", label: "Denver" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "UTC", label: "UTC" },
];

export function SettingsPanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("profile");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState(data.ownerName);
  const [agentName, setAgentName] = useState(data.agentName);
  const [defaultTimezone, setDefaultTimezone] = useState(data.defaultTimezone);
  const [soul, setSoul] = useState(data.soul);
  const [instructions, setInstructions] = useState(data.instructions);

  const [models, setModels] = useState(data.models);
  const [providerState, setProviderState] = useState(
    Object.fromEntries(
      data.providers.map((p) => [p.provider, { baseUrl: p.baseUrl, key: "", enabled: p.enabled }]),
    ) as Record<string, { baseUrl: string; key: string; enabled: boolean }>,
  );

  const mainModel = models.find((m) => m.role === "main");
  const primaryProvider = mainModel
    ? data.providers.find((p) => p.provider === mainModel.provider)
    : undefined;
  const primaryReady = Boolean(
    primaryProvider && primaryProvider.enabled && (primaryProvider.hasKey || primaryProvider.envKey),
  );

  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  function flash(message: string) {
    setNotice(message);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  }

  function patchModel(role: string, patch: Partial<SettingsData["models"][number]>) {
    setModels((prev) => prev.map((m) => (m.role === role ? { ...m, ...patch } : m)));
  }

  function changeRoleProvider(role: string, provider: string) {
    const preset = data.providers.find((p) => p.provider === provider);
    const current = models.find((m) => m.role === role);
    const options = preset?.models ?? [];
    const model =
      current && options.includes(current.model) ? current.model : (options[0] ?? "");
    patchModel(role, { provider, model });
  }

  async function saveProfile() {
    setBusy("profile");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_name: ownerName,
          agent_name: agentName,
          default_timezone: defaultTimezone,
          soul,
          instructions,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Could not save.");
      } else {
        flash("Saved. New runs will use this immediately.");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveModels() {
    setBusy("models");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ models }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Could not save models.");
      } else {
        flash("Model roles saved.");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function resetModels() {
    setBusy("reset");
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset_models" }),
    });
    setBusy(null);
    flash("Model roles reset to defaults.");
    router.refresh();
  }

  async function saveProvider(provider: string) {
    setBusy(provider);
    setError(null);
    const state = providerState[provider];
    // Adding a key means you want to use this provider: save it as active.
    const willEnable = state.key.trim().length > 0 ? true : state.enabled;
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: state.key || undefined,
          baseUrl: state.baseUrl,
          enabled: willEnable,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save the provider.");
      } else {
        setProviderState((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], key: "", enabled: willEnable },
        }));
        flash(
          willEnable
            ? `${provider} saved and enabled. You can make it primary below.`
            : `${provider} saved.`,
        );
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function makePrimary(provider: string) {
    const preset = data.providers.find((p) => p.provider === provider);
    const current = models.find((m) => m.role === "main");
    const options = preset?.models ?? [];
    const model =
      current && options.includes(current.model) ? current.model : (options[0] ?? current?.model ?? "");
    const next = models.map((m) => (m.role === "main" ? { ...m, provider, model } : m));

    setModels(next);
    setBusy(`primary-${provider}`);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ models: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not set the primary provider.");
      } else {
        flash(`${preset?.label ?? provider} is now the primary provider.`);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function clearProvider(provider: string) {
    if (!window.confirm(`Remove the stored key and settings for ${provider}?`)) return;
    setBusy(provider);
    await fetch(`/api/providers?provider=${encodeURIComponent(provider)}`, { method: "DELETE" });
    setBusy(null);
    flash(`${provider} removed.`);
    router.refresh();
  }

  async function createKey() {
    if (newKeyName.trim().length < 2) return;
    setBusy("key");
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not create the key.");
      } else {
        setCreatedKey(json.key);
        setNewKeyName("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this key? Anything using it will stop working.")) return;
    setBusy(id);
    await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  async function changePassword() {
    setBusy("password");
    setError(null);
    setPasswordNotice(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirm: confirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not change the password.");
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordNotice("Password changed. New sign-ins will use it.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "btn btn-sm shrink-0",
                tab === item.id && "btn-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-[0.8rem] text-[var(--danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-[var(--hairline)] bg-[var(--mint)] px-4 py-2.5 text-[0.8rem] text-[var(--mint-ink)]">
          <Check className="h-3.5 w-3.5" /> {notice}
        </div>
      )}

      {tab === "profile" && (
        <div className="space-y-4">
          <div className="card p-5">
            <label className="mb-2 block text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Your name
            </label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="input max-w-[320px]"
              maxLength={60}
              placeholder="Your name"
              autoComplete="name"
            />
            <p className="mt-2 text-[0.72rem] text-[var(--ink-muted)]">
              Shown in the sidebar. No email or account is needed — this instance has a single
              owner.
            </p>
          </div>

          <div className="card p-5">
            <label className="mb-2 block text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Default timezone
            </label>
            <input
              value={defaultTimezone}
              onChange={(e) => setDefaultTimezone(e.target.value)}
              className="input max-w-[320px] font-mono text-[0.8rem]"
              list="pocket-timezones"
              placeholder="Asia/Kolkata"
              spellCheck={false}
            />
            <datalist id="pocket-timezones">
              {TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </datalist>
            <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
              Used for &ldquo;today&rdquo;, &ldquo;in an hour&rdquo;, reminders and schedule forms.
              Default is <span className="font-mono">Asia/Kolkata</span> (IST). Any IANA zone works.
            </p>
          </div>

          <div className="card p-5">
            <label className="mb-2 block text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Agent name
            </label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="input max-w-[320px]"
              maxLength={60}
            />
            <p className="mt-2 text-[0.72rem] text-[var(--ink-muted)]">
              Shown in the prompt and on the dashboard. The name is cosmetic; the soul is what matters.
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--ink-muted)]" />
              <p className="text-[0.84rem] font-medium">Soul</p>
            </div>
            <p className="mt-1 text-[0.72rem] text-[var(--ink-muted)]">
              Who the agent is. Written in the second person. Keep it short — it is prepended to every run.
            </p>
            <textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={8}
              className="textarea mt-3 font-mono text-[0.76rem]"
              placeholder="You are Pocket Agent…"
            />
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--ink-muted)]" />
              <p className="text-[0.84rem] font-medium">Operating rules</p>
            </div>
            <p className="mt-1 text-[0.72rem] text-[var(--ink-muted)]">
              Hard constraints. These go after memory and skills, closest to the conversation.
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={8}
              className="textarea mt-3 font-mono text-[0.76rem]"
              placeholder="- Prefer the smallest tool…"
            />
          </div>

          <button onClick={saveProfile} disabled={busy === "profile"} className="btn btn-primary">
            {busy === "profile" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>

          <div className="card p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--ink-muted)]" />
              <p className="text-[0.84rem] font-medium">Dashboard password</p>
            </div>
            <p className="mt-1 text-[0.72rem] text-[var(--ink-muted)]">
              Change the password you use to sign in. Stored as a salted scrypt hash.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="input"
                autoComplete="current-password"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (8+)"
                className="input"
                autoComplete="new-password"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="input"
                autoComplete="new-password"
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={changePassword}
                disabled={
                  busy === "password" ||
                  !currentPassword ||
                  newPassword.length < 8 ||
                  newPassword !== confirmPassword
                }
                className="btn btn-sm"
              >
                {busy === "password" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Update password
              </button>
              {newPassword.length > 0 && newPassword !== confirmPassword && (
                <span className="text-[0.72rem] text-[var(--danger)]">
                  New passwords do not match.
                </span>
              )}
              {passwordNotice && (
                <span className="text-[0.72rem] text-[var(--ok)]">{passwordNotice}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "models" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.82rem] text-[var(--ink-muted)]">
              Pick the provider that powers your agent, then a model. Anything not in the list
              can be typed in.
            </p>
            <button onClick={resetModels} disabled={busy === "reset"} className="btn btn-sm">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </button>
          </div>

          {mainModel && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[0.84rem] font-medium">Primary</p>
                <span className="chip chip-ok">used by every run</span>
                {!primaryReady && <span className="chip chip-danger">no key</span>}
              </div>
              <p className="mt-1 text-[0.72rem] text-[var(--ink-muted)]">
                The provider and model the agent uses unless a specialised role below overrides
                it.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                    Provider
                  </label>
                  <select
                    value={mainModel.provider}
                    onChange={(e) => changeRoleProvider("main", e.target.value)}
                    className="select"
                  >
                    {data.providers.map((p) => (
                      <option key={p.provider} value={p.provider}>
                        {p.label}
                        {p.enabled && (p.hasKey || p.envKey) ? "" : " — no key"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                    Model
                  </label>
                  <ModelField
                    key={mainModel.provider}
                    provider={mainModel.provider}
                    model={mainModel.model}
                    providers={data.providers}
                    onChange={(value) => patchModel("main", { model: value })}
                  />
                </div>
              </div>

              {!primaryReady && (
                <p className="mt-3 text-[0.72rem] text-[var(--danger)]">
                  This provider has no key yet.{" "}
                  <button
                    type="button"
                    onClick={() => setTab("providers")}
                    className="underline underline-offset-2"
                  >
                    Add one in Providers
                  </button>{" "}
                  or pick a different primary.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Specialised roles
            </p>
            {models
              .filter((entry) => entry.role !== "main")
              .map((entry) => (
                <div key={entry.role} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.84rem] font-medium">{entry.label}</p>
                    <span className="chip">{entry.role}</span>
                    <span className="text-[0.7rem] text-[var(--ink-faint)]">
                      {entry.description}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select
                      value={entry.provider}
                      onChange={(e) => changeRoleProvider(entry.role, e.target.value)}
                      className="select"
                    >
                      {data.providers.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {p.label}
                          {p.enabled && (p.hasKey || p.envKey) ? "" : " — no key"}
                        </option>
                      ))}
                    </select>
                    <ModelField
                      key={entry.provider}
                      provider={entry.provider}
                      model={entry.model}
                      providers={data.providers}
                      onChange={(value) => patchModel(entry.role, { model: value })}
                    />
                  </div>
                </div>
              ))}
          </div>

          <button onClick={saveModels} disabled={busy === "models"} className="btn btn-primary">
            {busy === "models" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Save models
          </button>
        </div>
      )}

      {tab === "providers" && (
        <div className="space-y-3">
          <p className="text-[0.82rem] text-[var(--ink-muted)]">
            Keys are encrypted with AES-256-GCM before they touch the database. Environment
            variables are used as a fallback. Saving a key enables the provider automatically.
          </p>

          {data.providers.map((provider) => {
            const state = providerState[provider.provider];
            return (
              <div key={provider.provider} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.86rem] font-medium">{provider.label}</p>
                  {provider.hasKey && <span className="chip chip-ok">key saved</span>}
                  {!provider.hasKey && provider.envKey && (
                    <span className="chip chip-mint">env key</span>
                  )}
                  {provider.note && (
                    <span className="text-[0.68rem] text-[var(--ink-faint)]">{provider.note}</span>
                  )}
                  {mainModel?.provider === provider.provider && (
                    <span className="chip chip-ok">primary</span>
                  )}
                  <span
                    className={cn(
                      "chip ml-auto",
                      state.enabled && (provider.hasKey || provider.envKey)
                        ? "chip-ok"
                        : state.enabled
                          ? "chip-butter"
                          : "chip-danger",
                    )}
                  >
                    {state.enabled && (provider.hasKey || provider.envKey)
                      ? "active"
                      : state.enabled
                        ? "no key"
                        : "disabled"}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                      API key
                    </label>
                    <input
                      type="password"
                      value={state.key}
                      onChange={(e) =>
                        setProviderState((prev) => ({
                          ...prev,
                          [provider.provider]: { ...prev[provider.provider], key: e.target.value },
                        }))
                      }
                      placeholder={provider.hasKey ? "•••••••• (leave blank to keep)" : "paste key"}
                      className="input font-mono text-[0.78rem]"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                      Base URL
                    </label>
                    <input
                      value={state.baseUrl}
                      onChange={(e) =>
                        setProviderState((prev) => ({
                          ...prev,
                          [provider.provider]: { ...prev[provider.provider], baseUrl: e.target.value },
                        }))
                      }
                      className="input font-mono text-[0.78rem]"
                      placeholder="https://…/v1"
                    />
                  </div>
                </div>

                {provider.models.length > 0 && (
                  <p className="mt-2 font-mono text-[0.66rem] text-[var(--ink-faint)]">
                    {provider.models.slice(0, 5).join(" · ")}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-[0.76rem] text-[var(--ink-muted)]">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(e) =>
                        setProviderState((prev) => ({
                          ...prev,
                          [provider.provider]: { ...prev[provider.provider], enabled: e.target.checked },
                        }))
                      }
                    />
                    Enabled
                  </label>
                  <button
                    onClick={() => saveProvider(provider.provider)}
                    disabled={busy === provider.provider}
                    className="btn btn-sm btn-primary ml-auto"
                  >
                    {busy === provider.provider ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save
                  </button>
                  {(provider.hasKey || provider.envKey) && (
                    <button
                      onClick={() => makePrimary(provider.provider)}
                      disabled={
                        busy === `primary-${provider.provider}` ||
                        mainModel?.provider === provider.provider
                      }
                      className="btn btn-sm"
                      title="Use this provider for the main role"
                    >
                      {busy === `primary-${provider.provider}` ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {mainModel?.provider === provider.provider ? "Primary" : "Set primary"}
                    </button>
                  )}
                  {(provider.hasKey || !provider.enabled) && (
                    <button
                      onClick={() => clearProvider(provider.provider)}
                      className="btn btn-sm btn-danger"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "keys" && (
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-[0.84rem] font-medium">Create an API key</p>
            <p className="mt-1 text-[0.72rem] text-[var(--ink-muted)]">
              For the CLI and the HTTP API. The raw key is shown once, then only its hash is stored.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Name, e.g. laptop CLI"
                className="input flex-1"
                maxLength={60}
              />
              <button
                onClick={createKey}
                disabled={busy === "key" || newKeyName.trim().length < 2}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>

            {createdKey && (
              <div className="mt-4 rounded-[12px] border border-[var(--hairline)] bg-[var(--butter)] p-3">
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--butter-ink)]">
                  Copy it now — it will not be shown again
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white/60 px-2 py-1.5 font-mono text-[0.75rem] text-[var(--butter-ink)]">
                    {createdKey}
                  </code>
                  <button onClick={copyKey} className="btn btn-sm">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {data.keys.length === 0 ? (
            <div className="card-flat px-4 py-6 text-center text-[0.8rem] text-[var(--ink-muted)]">
              No keys yet. Create one to use the CLI or the HTTP API.
            </div>
          ) : (
            <div className="card divide-y divide-[var(--hairline)] overflow-hidden">
              {data.keys.map((key) => (
                <div key={key.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.84rem] font-medium">{key.name}</p>
                    <p className="mt-0.5 font-mono text-[0.68rem] text-[var(--ink-faint)]">
                      {key.prefix}… · created {fmtDate(key.createdAt)} ·{" "}
                      {key.lastUsedAt ? `used ${timeAgo(key.lastUsedAt)}` : "never used"}
                    </p>
                  </div>
                  <span className="chip">{key.scopes.join(", ")}</span>
                  <button
                    onClick={() => revokeKey(key.id)}
                    disabled={busy === key.id}
                    className="btn btn-sm btn-danger"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="card p-5">
            <p className="text-[0.84rem] font-medium">CLI</p>
            <pre className="mt-2 overflow-x-auto rounded-[10px] bg-[var(--surface-3)] p-3 font-mono text-[0.72rem] leading-relaxed">
{`export POCKET_URL=${data.env.appUrl}
export POCKET_API_KEY=pa_...

pocket-agent ask "summarise my week"
pocket-agent chat          # interactive
pocket-agent runs          # recent runs`}
            </pre>
          </div>
        </div>
      )}

      {tab === "channels" && <ChannelsBoard channels={data.channels} />}

      {tab === "system" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusRow label="Database" ok={data.env.database} detail="DATABASE_URL" />
            <StatusRow label="Auth secret" ok={data.env.authSecret} detail="AUTH_SECRET" />
            <StatusRow label="Owner password" ok={data.env.ownerPassword} detail="OWNER_PASSWORD" />
            <StatusRow label="Encryption key" ok={data.env.masterKey} detail="MASTER_KEY" />
            <StatusRow label="Cron secret" ok={data.env.cron} detail="CRON_SECRET" />
            <StatusRow
              label="Telegram"
              ok={data.channels.telegram.configured}
              detail="Settings → Channels"
            />
            <StatusRow
              label="Discord"
              ok={data.channels.discord.configured}
              detail="Settings → Channels"
            />
            <StatusRow
              label="Storage mirror"
              ok={data.env.storage}
              detail="SUPABASE_SERVICE_ROLE_KEY"
            />
            <StatusRow
              label="Web search"
              ok={data.env.search !== "none"}
              detail={`SEARCH_PROVIDER=${data.env.search}`}
            />
            <StatusRow
              label="Terminal"
              ok={data.env.exec === "local"}
              detail={`EXEC_BACKEND=${data.env.exec}`}
              warn={data.env.exec === "local"}
            />
            <StatusRow
              label="Approvals"
              ok={data.env.approvalMode !== "never"}
              detail={`APPROVAL_MODE=${data.env.approvalMode}`}
              warn={data.env.approvalMode === "never"}
            />
          </div>

          <div className="card p-5">
            <p className="text-[0.84rem] font-medium">App URL</p>
            <p className="mt-1 font-mono text-[0.78rem] text-[var(--ink-muted)]">
              {data.env.appUrl}
            </p>
            <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
              Used for provider referer headers and the Telegram webhook. Set APP_URL to your
              Render URL in production.
            </p>
          </div>

          <div className="card p-5">
            <p className="text-[0.84rem] font-medium">Keeping the free tier awake</p>
            <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
              Run this once in the Supabase SQL editor after deploying. It schedules a pg_cron job
              that pings <code>/api/cron/tick</code> every minute, which both keeps the instance
              from sleeping and drains the run queue.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-[10px] bg-[var(--surface-3)] p-3 font-mono text-[0.7rem] leading-relaxed">
{`select public.pocket_configure_keepalive(
  '${data.env.appUrl}',
  'your-cron-secret'
);`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelField({
  provider,
  model,
  providers,
  onChange,
}: {
  provider: string;
  model: string;
  providers: SettingsData["providers"];
  onChange: (value: string) => void;
}) {
  const options = providers.find((p) => p.provider === provider)?.models ?? [];
  const [custom, setCustom] = useState(() => model !== "" && !options.includes(model));
  const showCustom =
    options.length === 0 || custom || (model !== "" && !options.includes(model));

  if (showCustom) {
    return (
      <div className="flex gap-2">
        <input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="type a model id"
          className="input flex-1 font-mono text-[0.8rem]"
          autoComplete="off"
          spellCheck={false}
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(options[0] ?? "");
            }}
            className="btn btn-sm shrink-0"
            title="Pick from the list instead"
          >
            List
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <select
        value={options.includes(model) ? model : ""}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setCustom(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
        className="select"
      >
        <option value="" disabled>
          Choose a model…
        </option>
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="__custom__">Custom model…</option>
      </select>
      <p className="mt-1 text-[0.66rem] text-[var(--ink-faint)]">
        {options.length > 0
          ? `${options.length} suggestions — or choose custom and type any id`
          : "No suggestions for this provider; type the model id"}
      </p>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  detail,
  warn,
}: {
  label: string;
  ok: boolean;
  detail: string;
  warn?: boolean;
}) {
  return (
    <div className="card-flat flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          warn ? "bg-[var(--accent)]" : ok ? "bg-[var(--ok)]" : "bg-[var(--danger)]",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-medium">{label}</p>
        <p className="truncate font-mono text-[0.66rem] text-[var(--ink-faint)]">{detail}</p>
      </div>
      <span className={cn("chip", warn ? "chip-butter" : ok ? "chip-ok" : "chip-danger")}>
        {warn ? "attention" : ok ? "ready" : "missing"}
      </span>
    </div>
  );
}
