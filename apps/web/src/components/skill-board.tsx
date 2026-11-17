"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Markdown } from "./markdown";

export type SkillItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  bodyMd: string;
  tags: string[];
  enabled: boolean;
  status: string;
  version: number;
  createdBy: string;
  updatedAt: string;
};

export function SkillBoard({ skills }: { skills: SkillItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", body_md: "" });

  const pending = skills.filter((s) => s.status === "pending");
  const active = skills.filter((s) => s.status === "active");

  async function act(id: string, action: string, extra?: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Action failed.");
      else {
        setEditing(null);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this skill and its version history?")) return;
    setBusy(id);
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  async function create() {
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Could not create the skill.");
      else {
        setForm({ name: "", description: "", body_md: "" });
        setCreating(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-7">
      {error && (
        <div className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-[0.8rem] text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.84rem] font-medium">Write a skill yourself</p>
            <p className="mt-0.5 text-[0.72rem] text-[var(--ink-muted)]">
              A skill is a procedure the agent loads on demand. Good ones are specific and executable.
            </p>
          </div>
          <button onClick={() => setCreating((v) => !v)} className="btn btn-sm">
            <Plus className="h-3.5 w-3.5" /> {creating ? "Close" : "New skill"}
          </button>
        </div>

        {creating && (
          <div className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name, e.g. Publish a blog post"
              className="input"
              maxLength={80}
            />
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="When to use it, one line"
              className="input"
              maxLength={200}
            />
            <textarea
              value={form.body_md}
              onChange={(e) => setForm({ ...form, body_md: e.target.value })}
              placeholder={"## When to use\n\n## Steps\n1. …\n\n## Pitfalls\n- …"}
              className="textarea font-mono text-[0.78rem]"
              rows={10}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={create}
                disabled={busy === "new"}
                className="btn btn-primary btn-sm"
              >
                {busy === "new" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Save skill
              </button>
              <span className="text-[0.7rem] text-[var(--ink-faint)]">
                {form.body_md.length} characters
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Proposed by the agent
          </h2>
          <span className="chip chip-butter">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div className="card-flat px-4 py-6 text-center text-[0.8rem] text-[var(--ink-muted)]">
            Nothing to review. After a successful non-trivial task the agent may propose a skill here.
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((skill) => (
              <div key={skill.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-butter">v{skill.version}</span>
                  <p className="text-[0.88rem] font-medium">{skill.name}</p>
                  <span className="text-[0.7rem] text-[var(--ink-faint)]">/{skill.slug}</span>
                </div>
                <p className="mt-1.5 text-[0.78rem] text-[var(--ink-muted)]">{skill.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => act(skill.id, "approve")}
                    disabled={busy === skill.id}
                    className="btn btn-sm btn-primary"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => act(skill.id, "reject")}
                    disabled={busy === skill.id}
                    className="btn btn-sm btn-danger"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => setOpen(open === skill.id ? null : skill.id)}
                    className="btn btn-sm"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        open === skill.id && "rotate-180",
                      )}
                    />
                    Read procedure
                  </button>
                  <button onClick={() => remove(skill.id)} className="btn btn-sm btn-danger ml-auto">
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
                {open === skill.id && (
                  <div className="mt-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] p-4">
                    <Markdown text={skill.bodyMd} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Active skills
          </h2>
          <span className="chip chip-mint">{active.length}</span>
        </div>

        {active.length === 0 ? (
          <div className="card-flat px-4 py-6 text-center text-[0.8rem] text-[var(--ink-muted)]">
            No skills yet. Complete a task with the agent and it will propose one.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((skill) => (
              <div key={skill.id} className="card flex flex-col p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--lavender)] text-[var(--lavender-ink)]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.86rem] font-medium">{skill.name}</p>
                    <p className="text-[0.68rem] text-[var(--ink-faint)]">
                      /{skill.slug} · v{skill.version} · {skill.createdBy}
                    </p>
                  </div>
                  <span className={cn("chip", skill.enabled ? "chip-ok" : "chip-danger")}>
                    {skill.enabled ? "on" : "off"}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-[0.76rem] leading-relaxed text-[var(--ink-muted)]">
                  {skill.description}
                </p>

                <div className="mt-3 flex items-center gap-1">
                  <button
                    onClick={() => setOpen(open === skill.id ? null : skill.id)}
                    className="btn btn-sm"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        open === skill.id && "rotate-180",
                      )}
                    />
                    View
                  </button>
                  <button
                    onClick={() => act(skill.id, skill.enabled ? "disable" : "enable")}
                    disabled={busy === skill.id}
                    className="btn btn-sm"
                    title={skill.enabled ? "Disable" : "Enable"}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(skill.id)} className="btn btn-sm btn-danger ml-auto">
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>

                {open === skill.id && (
                  <div className="mt-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3">
                    {editing === skill.id ? (
                      <div>
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={12}
                          className="textarea font-mono text-[0.74rem]"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() =>
                              act(skill.id, "update", {
                                body_md: draft,
                                changelog: "Edited by the owner",
                              })
                            }
                            disabled={busy === skill.id}
                            className="btn btn-sm btn-primary"
                          >
                            Save as v{skill.version + 1}
                          </button>
                          <button onClick={() => setEditing(null)} className="btn btn-sm">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Markdown text={skill.bodyMd} />
                        <button
                          onClick={() => {
                            setEditing(skill.id);
                            setDraft(skill.bodyMd);
                          }}
                          className="btn btn-sm mt-3"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit procedure
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
