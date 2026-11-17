"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  Search,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";

export type FileItem = {
  id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
  runId: string | null;
  updatedAt: string;
  preview: string;
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBoard({ files }: { files: FileItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "artifact" | "file">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      files.filter((f) => {
        if (kind !== "all" && f.kind !== kind) return false;
        if (!query) return true;
        return `${f.name} ${f.path}`.toLowerCase().includes(query.toLowerCase());
      }),
    [files, kind, query],
  );

  async function remove(id: string) {
    if (!window.confirm("Delete this file? The database copy is removed too.")) return;
    setBusy(id);
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or path…"
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "artifact", "file"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              className={cn("btn btn-sm", kind === option && "btn-primary")}
            >
              {option === "all" ? "All" : option === "artifact" ? "Deliverables" : "Workspace"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-flat flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-3)] text-[var(--ink-muted)]">
            <FolderOpen className="h-5 w-5" />
          </div>
          <p className="text-[0.95rem] font-medium">No files here</p>
          <p className="mt-1.5 max-w-[42ch] text-[0.82rem] leading-relaxed text-[var(--ink-muted)]">
            Ask the agent to save a report or write a file, and it will appear here. Artifacts are mirrored to Supabase Storage when configured.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--hairline)] overflow-hidden">
          {filtered.map((file) => (
            <div key={file.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--ink-muted)]">
                  <FileText className="h-4 w-4" />
                </span>
                <button
                  onClick={() => setOpen(open === file.id ? null : file.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[0.85rem] font-medium">{file.name}</p>
                    <span className={cn("chip", file.kind === "artifact" ? "chip-mint" : "")}>
                      {file.kind}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[0.68rem] text-[var(--ink-faint)]">
                    {file.path} · {bytes(file.size)} · {fmtDate(file.updatedAt)}
                  </p>
                </button>
                <a
                  href={`/api/files/${file.id}`}
                  className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setOpen(open === file.id ? null : file.id)}
                  className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                  title="Preview"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", open === file.id && "rotate-180")}
                  />
                </button>
                <button
                  onClick={() => remove(file.id)}
                  disabled={busy === file.id}
                  className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  title="Delete"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>

              {open === file.id && (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3 font-mono text-[0.7rem] leading-relaxed text-[var(--ink-soft)]">
                  {file.preview || "(empty file)"}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
