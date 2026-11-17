"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash } from "lucide-react";

export function SessionActions({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function togglePin() {
    setBusy(true);
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this session, its messages and its runs?")) return;
    setBusy(true);
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={togglePin}
        disabled={busy}
        className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
        title={pinned ? "Unpin" : "Pin"}
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        title="Delete"
      >
        <Trash className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
