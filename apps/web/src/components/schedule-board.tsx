"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Send,
  Trash,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, timeAgo } from "@/lib/format";

export type ScheduleItem = {
  id: string;
  title: string;
  kind: "cron" | "once";
  cron: string;
  runAt: string | null;
  timezone: string;
  prompt: string;
  delivery: string;
  telegramChatId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const PRESETS = [
  { label: "Every weekday at 9am", cron: "0 9 * * 1-5" },
  { label: "Every day at 8am", cron: "0 8 * * *" },
  { label: "Every Monday at 9am", cron: "0 9 * * 1" },
  { label: "Every hour", cron: "0 * * * *" },
];

/** `datetime-local` value one hour from now, in the browser's timezone. */
function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleBoard({
  schedules,
  defaultTimezone,
  telegramReady,
  discordReady,
}: {
  schedules: ScheduleItem[];
  defaultTimezone: string;
  telegramReady: boolean;
  discordReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"once" | "recurring">("once");
  const [form, setForm] = useState({
    title: "",
    cron: "0 9 * * 1-5",
    when: defaultWhen(),
    prompt: "",
    timezone: defaultTimezone,
    delivery: "none" as "none" | "telegram" | "discord",
    telegramChatId: "",
  });

  async function act(id: string, action: "enable" | "disable" | "run") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Action failed.");
      else {
        if (action === "run" && json.sessionId) {
          router.push(`/chat/${json.sessionId}`);
          return;
        }
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this schedule? Past runs stay in their sessions.")) return;
    setBusy(id);
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  async function create() {
    setBusy("new");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          kind: mode === "once" ? "once" : "cron",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not create the schedule.");
        return;
      }
      setForm({
        title: "",
        cron: "0 9 * * 1-5",
        when: defaultWhen(),
        prompt: "",
        timezone: form.timezone,
        delivery: "none",
        telegramChatId: "",
      });
      setCreating(false);
      setNotice(
        json.kind === "once"
          ? `Reminder set for ${fmtDate(json.nextRunAt)}.`
          : `Scheduled. Next run ${fmtDate(json.nextRunAt)}.`,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-[0.8rem] text-[var(--danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--mint)] px-4 py-2.5 text-[0.8rem] text-[var(--mint-ink)]">
          {notice}
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.84rem] font-medium">New reminder or schedule</p>
            <p className="mt-0.5 text-[0.72rem] text-[var(--ink-muted)]">
              A one-time reminder fires once. A recurring task runs the prompt on a cron schedule.
              Either way the agent gets its own session.
            </p>
          </div>
          <button onClick={() => setCreating((v) => !v)} className="btn btn-sm">
            <Plus className="h-3.5 w-3.5" /> {creating ? "Close" : "New"}
          </button>
        </div>

        {creating && (
          <div className="mt-4 space-y-3">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={
                mode === "once" ? "Title, e.g. Call the dentist" : "Title, e.g. Morning briefing"
              }
              className="input"
              maxLength={120}
            />
            <textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder={
                mode === "once"
                  ? "What should the agent say or do when the reminder fires?"
                  : "What should the agent do each time? Be specific and self-contained."
              }
              className="textarea"
              rows={3}
              maxLength={4000}
            />

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode("once")}
                className={cn("btn btn-sm", mode === "once" && "btn-primary")}
              >
                One-time
              </button>
              <button
                type="button"
                onClick={() => setMode("recurring")}
                className={cn("btn btn-sm", mode === "recurring" && "btn-primary")}
              >
                Recurring
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "once" ? (
                <div>
                  <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                    When
                  </label>
                  <input
                    type="datetime-local"
                    value={form.when}
                    onChange={(e) => setForm({ ...form, when: e.target.value })}
                    className="input"
                  />
                  <p className="mt-2 text-[0.7rem] text-[var(--ink-faint)]">
                    Interpreted in the timezone below. It fires once, then switches itself off.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                    Cron
                  </label>
                  <input
                    value={form.cron}
                    onChange={(e) => setForm({ ...form, cron: e.target.value })}
                    className="input font-mono text-[0.8rem]"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.cron}
                        type="button"
                        onClick={() => setForm({ ...form, cron: preset.cron })}
                        className={cn("chip", form.cron === preset.cron && "chip-butter")}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                  Timezone
                </label>
                <input
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="input"
                />
                <label className="mb-1.5 mt-3 block text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                  Delivery
                </label>
                <select
                  value={form.delivery}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      delivery: e.target.value as "none" | "telegram" | "discord",
                    })
                  }
                  className="select"
                >
                  <option value="none">Keep in the app</option>
                  <option value="telegram">Send to Telegram</option>
                  <option value="discord">Send to Discord</option>
                </select>
                {form.delivery !== "none" && (
                  <input
                    value={form.telegramChatId}
                    onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                    placeholder={
                      form.delivery === "discord"
                        ? "Discord channel id"
                        : "Chat id (optional if you message the bot first)"
                    }
                    className="input mt-2"
                  />
                )}
                {form.delivery === "telegram" && !telegramReady && (
                  <p className="mt-1.5 text-[0.7rem] text-[var(--danger)]">
                    Telegram is not connected. Add a bot token under Settings → Channels.
                  </p>
                )}
                {form.delivery === "discord" && !discordReady && (
                  <p className="mt-1.5 text-[0.7rem] text-[var(--danger)]">
                    Discord is not connected. Add a bot token and public key under Settings →
                    Channels.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={create} disabled={busy === "new"} className="btn btn-primary btn-sm">
                {busy === "new" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Create schedule
              </button>
            </div>
          </div>
        )}
      </div>

      {schedules.length === 0 ? (
        <div className="card-flat flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--butter)] text-[var(--butter-ink)]">
            <CalendarClock className="h-5 w-5" />
          </div>
          <p className="text-[0.95rem] font-medium">No schedules yet</p>
          <p className="mt-1.5 max-w-[40ch] text-[0.82rem] leading-relaxed text-[var(--ink-muted)]">
            A morning briefing, a weekly review, a nightly check — anything that should happen without you asking.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.9rem] font-medium">{schedule.title}</p>
                    <span
                      className={cn(
                        "chip",
                        schedule.enabled
                          ? "chip-ok"
                          : schedule.kind === "once" && schedule.lastRunAt
                            ? "chip-mint"
                            : "chip-danger",
                      )}
                    >
                      {schedule.kind === "once" && !schedule.enabled && schedule.lastRunAt
                        ? "fired"
                        : schedule.enabled
                          ? "on"
                          : "paused"}
                    </span>
                    {schedule.kind === "once" ? (
                      <span className="chip chip-lavender">one-time</span>
                    ) : (
                      <span className="chip">recurring</span>
                    )}
                    {schedule.delivery === "telegram" && (
                      <span className="chip chip-lavender">
                        <Send className="h-2.5 w-2.5" /> telegram
                      </span>
                    )}
                    {schedule.delivery === "discord" && (
                      <span className="chip chip-lavender">
                        <Send className="h-2.5 w-2.5" /> discord
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.78rem] text-[var(--ink-muted)]">
                    {schedule.prompt}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-[var(--ink-faint)]">
                    {schedule.kind === "once" ? (
                      <span>
                        {schedule.lastRunAt ? "Fired:" : "Reminder:"}{" "}
                        {schedule.runAt ? fmtDate(schedule.runAt) : "—"}
                      </span>
                    ) : (
                      <>
                        <span className="font-mono">{schedule.cron}</span>
                        <span>
                          Next:{" "}
                          {schedule.enabled && schedule.nextRunAt
                            ? fmtDate(schedule.nextRunAt)
                            : "—"}
                        </span>
                      </>
                    )}
                    <span>{schedule.timezone}</span>
                    <span>Last: {schedule.lastRunAt ? timeAgo(schedule.lastRunAt) : "never"}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => act(schedule.id, "run")}
                    disabled={busy === schedule.id}
                    className="btn btn-sm"
                    title="Run now"
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </button>
                  {!(schedule.kind === "once" && schedule.lastRunAt) && (
                    <button
                      onClick={() => act(schedule.id, schedule.enabled ? "disable" : "enable")}
                      disabled={busy === schedule.id}
                      className="btn btn-sm"
                      title={schedule.enabled ? "Pause" : "Resume"}
                    >
                      {schedule.enabled ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => remove(schedule.id)}
                    className="btn btn-sm btn-danger"
                    title="Delete"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
