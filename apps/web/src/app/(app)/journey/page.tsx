import { desc } from "drizzle-orm";
import { getDb, journeyEvents } from "@pocket/db";
import { PageHeader } from "@/components/ui";
import { fmtDate, timeAgo } from "@/lib/format";
import { Brain, Route, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TONE: Record<string, { chip: string; label: string }> = {
  memory_added: { chip: "chip-lavender", label: "Memory added" },
  memory_proposed: { chip: "chip-butter", label: "Memory proposed" },
  memory_approved: { chip: "chip-mint", label: "Memory approved" },
  memory_updated: { chip: "chip-lavender", label: "Memory updated" },
  skill_created: { chip: "chip-mint", label: "Skill created" },
  skill_proposed: { chip: "chip-butter", label: "Skill proposed" },
  skill_approved: { chip: "chip-mint", label: "Skill approved" },
  skill_improved: { chip: "chip-lavender", label: "Skill improved" },
};

export default async function JourneyPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(journeyEvents)
    .orderBy(desc(journeyEvents.createdAt))
    .limit(200);

  const counts = {
    memories: rows.filter((r) => r.type.startsWith("memory_")).length,
    skills: rows.filter((r) => r.type.startsWith("skill_")).length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Journey"
        description="A record of what the agent learned and when. Memory and skills are earned here, not assumed."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip chip-lavender">{counts.memories} memory events</span>
            <span className="chip chip-mint">{counts.skills} skill events</span>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="card-flat flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--lavender)] text-[var(--lavender-ink)]">
            <Route className="h-5 w-5" />
          </div>
          <p className="text-[0.95rem] font-medium">The journey starts with the first task</p>
          <p className="mt-1.5 max-w-[46ch] text-[0.82rem] leading-relaxed text-[var(--ink-muted)]">
            After a completed run, the learning loop proposes memories and skills. Approve them and they appear here as a timeline.
          </p>
        </div>
      ) : (
        <div className="card p-5 sm:p-6">
          <ol className="relative space-y-0 border-l border-[var(--hairline)] pl-5">
            {rows.map((event) => {
              const meta = TONE[event.type] ?? { chip: "", label: event.type.replaceAll("_", " ") };
              const Icon = event.type.startsWith("skill_")
                ? Sparkles
                : event.type.startsWith("memory_")
                  ? Brain
                  : Route;
              return (
                <li key={event.id} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)]">
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("chip", meta.chip)}>{meta.label}</span>
                    <span className="text-[0.68rem] text-[var(--ink-faint)]">
                      {timeAgo(event.createdAt)} · {fmtDate(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.86rem] leading-relaxed">{event.summary}</p>
                  {event.meta && Object.keys(event.meta as object).length > 0 ? (
                    <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[0.66rem] text-[var(--ink-faint)]">
                      {JSON.stringify(event.meta, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
