"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Check,
  LoaderCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { MEMORY_BUDGETS } from "@pocket/shared";

export type MemoryItem = {
  id: string;
  scope: string;
  kind: string;
  content: string;
  pinned: boolean;
  status: string;
  reason: string | null;
  createdAt: string;
};

export function MemoryBoard({ memories }: { memories: MemoryItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<"agent" | "user">("agent");
  const [pin, setPin] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const agentUsed = useMemo(
    () =>
      memories
        .filter((m) => m.scope === "agent" && m.pinned && m.status === "active")
        .reduce((sum, m) => sum + m.content.length + 3, 0),
    [memories],
  );
  const userUsed = useMemo(
    () =>
      memories
        .filter((m) => m.scope === "user" && m.pinned && m.status === "active")
        .reduce((sum, m) => sum + m.content.length + 3, 0),
    [memories],
  );

  const pending = memories.filter((m) => m.status === "pending");
  const active = memories.filter((m) => m.status === "active");
  const filtered = active.filter((m) =>
    query ? m.content.toLowerCase().includes(query.toLowerCase()) : true,
  );

  async function act(id: string, action: string, extra?: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Action failed.");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (content.trim().length < 3) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, scope, pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not add memory.");
      } else {
        setContent("");
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this memory permanently?")) return;
    setBusy(id);
    await fetch(`/api/memory/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-[0.8rem] text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <BudgetCard
          icon={<Brain className="h-4 w-4" />}
          title="Agent memory"
          used={agentUsed}
          budget={MEMORY_BUDGETS.agent}
          tone="var(--lavender)"
          hint="Lessons about how to do the work."
        />
        <BudgetCard
          icon={<User className="h-4 w-4" />}
          title="User memory"
          used={userUsed}
          budget={MEMORY_BUDGETS.user}
          tone="var(--butter)"
          hint="Your preferences, setup and conventions."
        />
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.82rem] font-medium">Add a memory</p>
            <p className="mt-0.5 text-[0.72rem] text-[var(--ink-muted)]">
              Pinned memories are loaded into every prompt.
            </p>
          </div>
          <button onClick={() => setAdding((v) => !v)} className="btn btn-sm">
            <Plus className="h-3.5 w-3.5" /> {adding ? "Close" : "Add"}
          </button>
        </div>

        {adding && (
          <div className="mt-4 space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="One self-contained fact, e.g. “Deploys to Render; state lives in Supabase.”"
              className="textarea"
              maxLength={500}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "agent" | "user")}
                className="select w-auto"
              >
                <option value="agent">Agent memory</option>
                <option value="user">User memory</option>
              </select>
              <label className="flex items-center gap-2 text-[0.78rem] text-[var(--ink-muted)]">
                <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
                Pin to core memory
              </label>
              <button
                onClick={add}
                disabled={busy === "new" || content.trim().length < 3}
                className="btn btn-primary btn-sm ml-auto"
              >
                {busy === "new" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Pending review
          </h2>
          <span className="chip chip-butter">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div className="card-flat px-4 py-6 text-center text-[0.8rem] text-[var(--ink-muted)]">
            Nothing waiting. The learning loop proposes memories after completed runs.
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((memory) => (
              <div key={memory.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="chip chip-butter shrink-0">{memory.scope}</span>
                  <p className="min-w-0 flex-1 text-[0.86rem] leading-relaxed">{memory.content}</p>
                </div>
                {memory.reason && (
                  <p className="mt-2 text-[0.72rem] text-[var(--ink-muted)]">Why: {memory.reason}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => act(memory.id, "approve")}
                    disabled={busy === memory.id}
                    className="btn btn-sm btn-primary"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => act(memory.id, "reject")}
                    disabled={busy === memory.id}
                    className="btn btn-sm btn-danger"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => {
                      setEditing(memory.id);
                      setEditContent(memory.content);
                    }}
                    className="btn btn-sm"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
                {editing === memory.id && (
                  <div className="mt-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="textarea"
                      rows={2}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={async () => {
                          await act(memory.id, "update", { content: editContent });
                          await act(memory.id, "approve");
                          setEditing(null);
                        }}
                        className="btn btn-sm btn-primary"
                      >
                        Save & approve
                      </button>
                      <button onClick={() => setEditing(null)} className="btn btn-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Active memory
          </h2>
          <div className="relative w-full max-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter memories…"
              className="input h-8 pl-8 text-[0.78rem]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card-flat px-4 py-6 text-center text-[0.8rem] text-[var(--ink-muted)]">
            No memories yet. Ask the agent to remember something, or add one above.
          </div>
        ) : (
          <div className="card divide-y divide-[var(--hairline)] overflow-hidden">
            {filtered.map((memory) => (
              <div key={memory.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      "chip",
                      memory.scope === "user" ? "chip-butter" : "chip-lavender",
                    )}
                  >
                    {memory.scope}
                  </span>
                  {memory.pinned && <Pin className="h-3 w-3 text-[var(--accent)]" />}
                </div>
                <div className="min-w-0 flex-1">
                  {editing === memory.id ? (
                    <div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="textarea text-[0.82rem]"
                        rows={2}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={async () => {
                            await act(memory.id, "update", { content: editContent });
                            setEditing(null);
                          }}
                          className="btn btn-sm btn-primary"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditing(null)} className="btn btn-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[0.84rem] leading-relaxed">{memory.content}</p>
                  )}
                  <p className="mt-1 text-[0.66rem] text-[var(--ink-faint)]">
                    {memory.kind}
                    {memory.reason ? ` · ${memory.reason}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => act(memory.id, memory.pinned ? "unpin" : "pin")}
                    disabled={busy === memory.id}
                    className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                    title={memory.pinned ? "Unpin" : "Pin"}
                  >
                    {memory.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(memory.id);
                      setEditContent(memory.content);
                    }}
                    className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(memory.id)}
                    className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    title="Delete"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetCard({
  icon,
  title,
  used,
  budget,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  used: number;
  budget: number;
  tone: string;
  hint: string;
}) {
  const pct = Math.min(100, Math.round((used / budget) * 100));
  return (
    <div className="card p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: tone }}
        >
          {icon}
        </span>
        <p className="text-[0.84rem] font-medium">{title}</p>
        <span className="ml-auto text-[0.7rem] text-[var(--ink-muted)]">
          {used}/{budget}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct > 90 ? "var(--danger)" : "var(--accent)",
          }}
        />
      </div>
      <p className="mt-2 text-[0.7rem] text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}
