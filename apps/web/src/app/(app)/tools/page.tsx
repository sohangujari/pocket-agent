import { PageHeader } from "@/components/ui";
import { ALL_TOOLS } from "@pocket/tools";
import { TOOLSETS } from "@pocket/core";
import { serverEnv } from "@pocket/shared/env";
import { cn } from "@/lib/cn";
import { RiskChip } from "@/components/ui";
import { Search, ShieldCheck, Terminal, Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

const TOOLSET_ICON: Record<string, string> = {
  memory: "var(--lavender)",
  skills: "var(--mint)",
  sessions: "var(--surface-3)",
  web: "var(--butter)",
  files: "var(--peach)",
  exec: "var(--danger-soft)",
  automation: "var(--mint)",
  delegate: "var(--lavender)",
  media: "var(--peach)",
  system: "var(--surface-3)",
};

export default async function ToolsPage() {
  const groups = TOOLSETS.map((toolset) => ({
    ...toolset,
    tools: ALL_TOOLS.filter((tool) => tool.toolsets.includes(toolset.id)),
  })).filter((group) => group.tools.length > 0);

  const counts = {
    total: ALL_TOOLS.length,
    safe: ALL_TOOLS.filter((t) => t.risk === "safe").length,
    caution: ALL_TOOLS.filter((t) => t.risk === "caution").length,
    dangerous: ALL_TOOLS.filter((t) => t.risk === "dangerous").length,
  };

  const searchReady = serverEnv.searchProvider !== "none";
  const execReady = serverEnv.execBackend === "local";

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Tools"
        description="What the agent can actually do. Each tool declares a risk level; dangerous ones pause for your approval before running."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip">{counts.total} tools</span>
            <span className="chip chip-ok">{counts.safe} safe</span>
            <span className="chip chip-danger">{counts.dangerous} dangerous</span>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--butter)] text-[var(--butter-ink)]">
              <Search className="h-3.5 w-3.5" />
            </span>
            <p className="text-[0.82rem] font-medium">Web search</p>
            <span className={cn("chip ml-auto", searchReady ? "chip-ok" : "chip-danger")}>
              {searchReady ? serverEnv.searchProvider : "off"}
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
            {searchReady
              ? "Search is configured. The agent can look things up and read pages."
              : "Set SEARCH_PROVIDER and SEARCH_API_KEY to enable web_search. web_fetch works without it."}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--danger-soft)] text-[var(--danger)]">
              <Terminal className="h-3.5 w-3.5" />
            </span>
            <p className="text-[0.82rem] font-medium">Terminal</p>
            <span className={cn("chip ml-auto", execReady ? "chip-butter" : "chip-danger")}>
              {execReady ? "local" : "disabled"}
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
            {execReady
              ? "Shell commands run inside the container, approval-gated. Not a sandbox — keep the allowlist tight."
              : "Shell access is off. Enable with EXEC_BACKEND=local only if you trust the tasks you give it."}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--mint)] text-[var(--mint-ink)]">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <p className="text-[0.82rem] font-medium">Approval mode</p>
            <span className="chip ml-auto">{serverEnv.approvalMode}</span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
            {serverEnv.approvalMode === "never"
              ? "Dangerous actions run without asking. Only use this if you fully trust the workspace."
              : serverEnv.approvalMode === "writes"
                ? "Any action that changes something pauses for approval."
                : "Only dangerous actions (shell, destructive writes) pause for approval."}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.id}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-lg"
                style={{ background: TOOLSET_ICON[group.id] ?? "var(--surface-3)" }}
              >
                <Wrench className="h-3 w-3" />
              </span>
              <h2 className="text-[0.84rem] font-semibold">{group.label}</h2>
              <span className="text-[0.72rem] text-[var(--ink-faint)]">{group.description}</span>
              <span className="chip ml-auto">{group.tools.length}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {group.tools.map((tool) => {
                const disabled =
                  (tool.name === "terminal" && !execReady) ||
                  (tool.name === "web_search" && !searchReady);
                return (
                  <div
                    key={tool.name}
                    className={cn("card-flat p-3.5", disabled && "opacity-60")}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[0.78rem] font-medium">{tool.name}</p>
                      <RiskChip risk={tool.risk} />
                      {disabled && <span className="chip chip-danger ml-auto">not configured</span>}
                    </div>
                    <p className="mt-1.5 text-[0.73rem] leading-relaxed text-[var(--ink-muted)]">
                      {tool.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
