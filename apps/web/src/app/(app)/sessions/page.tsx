import Link from "next/link";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb, sessions } from "@pocket/db";
import { PageHeader, EmptyState, StatusChip } from "@/components/ui";
import { SessionActions } from "@/components/session-actions";
import { timeAgo, num } from "@/lib/format";
import { MessageSquare, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const db = getDb();

  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      source: sessions.source,
      pinned: sessions.pinned,
      updatedAt: sessions.updatedAt,
      tokenCount: sessions.tokenCount,
      summary: sessions.summary,
    })
    .from(sessions)
    .where(q ? and(ilike(sessions.title, `%${q}%`), eq(sessions.archived, false)) : eq(sessions.archived, false))
    .orderBy(desc(sessions.pinned), desc(sessions.updatedAt))
    .limit(150);

  const counts = (await db.execute(sql`
    select count(*)::text as total,
           count(*) filter (where source = 'telegram')::text as telegram,
           count(*) filter (where source = 'schedule')::text as scheduled
    from sessions
    where archived = false
  `)) as unknown as { total: string; telegram: string; scheduled: string }[];

  const c = counts[0];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Sessions"
        description="Every conversation across web, CLI and Telegram. Runs and messages stay linked to the session that produced them."
        actions={
          <Link href="/chat" className="btn btn-primary">
            New task
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card-flat px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total</p>
          <p className="mt-1 text-[1.35rem] leading-none font-medium">{num(Number(c?.total ?? 0))}</p>
        </div>
        <div className="card-flat px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Telegram</p>
          <p className="mt-1 text-[1.35rem] leading-none font-medium">{num(Number(c?.telegram ?? 0))}</p>
        </div>
        <div className="card-flat px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Scheduled</p>
          <p className="mt-1 text-[1.35rem] leading-none font-medium">{num(Number(c?.scheduled ?? 0))}</p>
        </div>
      </div>

      <form className="mb-4 flex items-center gap-2" action="/sessions">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search session titles…"
            className="input pl-9"
          />
        </div>
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-5 w-5" />}
          title={q ? "No sessions match that search" : "No sessions yet"}
          description={
            q
              ? "Try a different word, or search inside messages from the agent with session_search."
              : "Start a task and it will appear here with its full trace."
          }
          action={
            <Link href="/chat" className="btn btn-primary">
              Start a task
            </Link>
          }
        />
      ) : (
        <div className="card divide-y divide-[var(--hairline)] overflow-hidden">
          {rows.map((session) => (
            <div key={session.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)]">
              <Link href={`/chat/${session.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[0.86rem] font-medium">{session.title}</p>
                  {session.pinned && <span className="chip chip-butter">pinned</span>}
                </div>
                <p className="mt-0.5 truncate text-[0.72rem] text-[var(--ink-muted)]">
                  {session.source} · {timeAgo(session.updatedAt)} · {num(session.tokenCount)} tokens
                  {session.summary ? ` · ${session.summary.slice(0, 80)}` : ""}
                </p>
              </Link>
              <SessionActions id={session.id} pinned={session.pinned} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
