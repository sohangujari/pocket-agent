import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import {
  approvals,
  getDb,
  journeyEvents,
  runs,
  sessions,
} from "@pocket/db";
import { resolveModels } from "@pocket/core";
import { PageHeader, Stat, StatusChip, SectionTitle, EmptyState } from "@/components/ui";
import { money, num, timeAgo } from "@/lib/format";
import { ArrowRight, Sparkles, Brain, Zap, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

type Stats = {
  runs_total: string;
  runs_week: string;
  completed_week: string;
  approvals_pending: string;
  memories_active: string;
  memories_pending: string;
  skills_active: string;
  skills_pending: string;
  tokens_week: string;
  cost_week: string;
  sessions_total: string;
};

export default async function DashboardPage() {
  const db = getDb();

  const statsRows = (await db.execute(sql`
    select
      (select count(*) from runs)::text as runs_total,
      (select count(*) from runs where created_at > now() - interval '7 days')::text as runs_week,
      (select count(*) from runs where status = 'completed' and created_at > now() - interval '7 days')::text as completed_week,
      (select count(*) from approvals where decision = 'pending')::text as approvals_pending,
      (select count(*) from memories where status = 'active')::text as memories_active,
      (select count(*) from memories where status = 'pending')::text as memories_pending,
      (select count(*) from skills where status = 'active')::text as skills_active,
      (select count(*) from skills where status = 'pending')::text as skills_pending,
      (select coalesce(sum(input_tokens + output_tokens), 0) from usage_ledger where created_at > now() - interval '7 days')::text as tokens_week,
      (select coalesce(sum(cost_usd), 0) from usage_ledger where created_at > now() - interval '7 days')::text as cost_week,
      (select count(*) from sessions)::text as sessions_total
  `)) as unknown as Stats[];

  const stats = statsRows[0] ?? ({} as Stats);

  const recentRuns = await db
    .select({
      id: runs.id,
      status: runs.status,
      input: runs.input,
      createdAt: runs.createdAt,
      tokensUsed: runs.tokensUsed,
      costUsd: runs.costUsd,
      sessionId: runs.sessionId,
      title: sessions.title,
      source: runs.source,
    })
    .from(runs)
    .leftJoin(sessions, eq(runs.sessionId, sessions.id))
    .orderBy(desc(runs.createdAt))
    .limit(6);

  const pending = await db
    .select({
      id: approvals.id,
      toolName: approvals.toolName,
      risk: approvals.risk,
      createdAt: approvals.createdAt,
      runId: approvals.runId,
      sessionId: runs.sessionId,
      title: sessions.title,
    })
    .from(approvals)
    .innerJoin(runs, eq(approvals.runId, runs.id))
    .leftJoin(sessions, eq(runs.sessionId, sessions.id))
    .where(eq(approvals.decision, "pending"))
    .orderBy(desc(approvals.createdAt))
    .limit(4);

  const journey = await db
    .select()
    .from(journeyEvents)
    .orderBy(desc(journeyEvents.createdAt))
    .limit(5);

  let modelReady = true;
  try {
    modelReady = (await resolveModels("main")).length > 0;
  } catch {
    modelReady = false;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const runsWeek = Number(stats.runs_week ?? 0);
  const completedWeek = Number(stats.completed_week ?? 0);
  const successRate = runsWeek > 0 ? Math.round((completedWeek / runsWeek) * 100) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`${greeting}.`}
        description="Your agent runs on a server, remembers what matters, and keeps working while your devices are asleep."
        actions={
          <>
            <Link href="/sessions" className="btn hidden sm:inline-flex">
              Sessions
            </Link>
            <Link href="/chat" className="btn btn-primary">
              New task
            </Link>
          </>
        }
      />

      {!modelReady && (
        <div className="mb-5 flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--hairline-strong)] bg-[var(--accent-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.9rem] font-medium text-[var(--accent-ink)]">
              Connect a model to wake the agent
            </p>
            <p className="mt-0.5 text-[0.78rem] text-[var(--accent-ink)]/80">
              Add an OpenAI, Claude, Gemini, Z.ai or OpenRouter key in Settings → Models.
            </p>
          </div>
          <Link href="/settings" className="btn btn-sm btn-primary shrink-0">
            Open settings
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="hero relative flex min-h-[280px] flex-col justify-between p-6 sm:p-8 lg:col-span-2 lg:min-h-[300px]">
          <div className="flex items-center gap-2 text-[0.72rem] font-medium text-[#5b4315]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#33240a] text-[#f8dfa4]">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            Agent runtime · live
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#3f7d4f]" />
          </div>

          <div className="mt-8 max-w-[440px] lg:pr-[230px]">
            <h2 className="hero-serif text-[clamp(2.1rem,3.6vw,3.05rem)] text-[#33240a]">
              Everything you asked for,
              <br />
              already in motion.
            </h2>
            <p className="mt-4 max-w-[380px] text-[0.88rem] leading-relaxed text-[#5b4315]/90">
              {Number(stats.runs_total ?? 0) === 0
                ? "Send the first task. It will use tools, show its work, and save what it learns."
                : `${runsWeek} runs this week, ${successRate}% completed. Memory and skills carry across sessions.`}
            </p>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Link
              href="/chat"
              className="btn"
              style={{ background: "#33240a", borderColor: "#33240a", color: "#fff8e6" }}
            >
              Start a task <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/journey"
              className="btn"
              style={{ background: "rgba(255,255,255,0.45)", borderColor: "rgba(51,36,10,0.18)", color: "#33240a" }}
            >
              See what it learned
            </Link>
          </div>

          <div className="absolute bottom-6 right-6 hidden w-[210px] rounded-[18px] border border-white/60 bg-white/70 p-4 backdrop-blur-md lg:block">
            <p className="text-[0.63rem] uppercase tracking-[0.14em] text-[#6b4d13]/80">This week</p>
            <p className="mt-2 text-[1.7rem] leading-none font-medium text-[#33240a]">
              {num(Number(stats.tokens_week ?? 0))}
            </p>
            <p className="text-[0.7rem] text-[#5b4315]/80">tokens</p>
            <div className="mt-3 h-px bg-[#33240a]/10" />
            <p className="mt-2 text-[0.72rem] text-[#5b4315]/80">
              {money(Number(stats.cost_week ?? 0))} spent · {successRate}% success
            </p>
          </div>
        </section>

        <section className="card flex flex-col p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Needs you
            </h2>
            {pending.length > 0 && (
              <span className="chip chip-butter">{pending.length} pending</span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--mint)] text-[var(--mint-ink)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="text-[0.88rem] font-medium">All clear</p>
              <p className="mt-1 max-w-[28ch] text-[0.76rem] leading-relaxed text-[var(--ink-muted)]">
                Nothing is waiting for approval. Dangerous actions will pause here.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex-1 space-y-2">
              {pending.map((item) => (
                <Link
                  key={item.id}
                  href={item.sessionId ? `/chat/${item.sessionId}` : "/chat"}
                  className="block rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-2)] p-3 hover:border-[var(--hairline-strong)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.8rem] font-medium">{item.toolName}</span>
                    <span className="chip chip-butter">{item.risk}</span>
                  </div>
                  <p className="mt-1 truncate text-[0.7rem] text-[var(--ink-muted)]">
                    {item.title ?? "Session"} · {timeAgo(item.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}

          <Link href="/sessions" className="mt-4 text-[0.75rem] text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Browse sessions →
          </Link>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Runs this week" value={num(runsWeek)} hint={`${num(Number(stats.runs_total ?? 0))} all time`} tone="butter" />
        <Stat
          label="Memories"
          value={num(Number(stats.memories_active ?? 0))}
          hint={`${num(Number(stats.memories_pending ?? 0))} awaiting review`}
          tone="lavender"
        />
        <Stat
          label="Skills"
          value={num(Number(stats.skills_active ?? 0))}
          hint={`${num(Number(stats.skills_pending ?? 0))} proposed`}
          tone="mint"
        />
        <Stat label="Sessions" value={num(Number(stats.sessions_total ?? 0))} hint="across web, CLI and Telegram" tone="peach" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle title="Recent runs" action="All sessions" href="/sessions" />
          {recentRuns.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-5 w-5" />}
              title="No runs yet"
              description="Your first task will appear here with its full step-by-step trace."
              action={
                <Link href="/chat" className="btn btn-primary">
                  Start a task
                </Link>
              }
            />
          ) : (
            <div className="card divide-y divide-[var(--hairline)] overflow-hidden">
              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.85rem] font-medium">
                      {run.title ?? run.input ?? "Untitled run"}
                    </p>
                    <p className="mt-0.5 truncate text-[0.72rem] text-[var(--ink-muted)]">
                      {run.source} · {timeAgo(run.createdAt)} · {num(run.tokensUsed)} tokens
                    </p>
                  </div>
                  <StatusChip status={run.status} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle title="Learning journey" action="Full timeline" href="/journey" />
          {journey.length === 0 ? (
            <div className="card p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--lavender)] text-[var(--lavender-ink)]">
                <Brain className="h-4.5 w-4.5" />
              </div>
              <p className="mt-3 text-[0.86rem] font-medium">Nothing learned yet</p>
              <p className="mt-1 text-[0.76rem] leading-relaxed text-[var(--ink-muted)]">
                After a few tasks, approved memories and skills will show up here as a timeline.
              </p>
            </div>
          ) : (
            <div className="card p-5">
              <ol className="relative space-y-4 border-l border-[var(--hairline)] pl-4">
                {journey.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
                    <p className="text-[0.8rem] leading-snug">{event.summary}</p>
                    <p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">
                      {event.type.replaceAll("_", " ")} · {timeAgo(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
