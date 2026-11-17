import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, runEvents, runs, sessions } from "@pocket/db";
import { PageHeader, StatusChip } from "@/components/ui";
import { fmtDate, money, num } from "@/lib/format";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function RunTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run) notFound();

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, run.sessionId))
    .limit(1);

  const events = await db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, id))
    .orderBy(asc(runEvents.id))
    .limit(1000);

  let text = "";
  const rows: {
    key: string;
    kind: "step" | "text" | "tool" | "approval" | "usage" | "error" | "notice";
    label: string;
    body?: unknown;
    ok?: boolean;
  }[] = [];

  for (const event of events) {
    const payload = (event.payload ?? {}) as any;
    switch (event.type) {
      case "step_started":
        rows.push({ key: String(event.id), kind: "step", label: `Step ${payload.step}` });
        break;
      case "text":
        text += String(payload.delta ?? "");
        break;
      case "tool_call":
        rows.push({
          key: String(event.id),
          kind: "tool",
          label: payload.name,
          body: payload.args,
        });
        break;
      case "tool_result":
        rows.push({
          key: `r-${event.id}`,
          kind: "tool",
          label: `${payload.name} result`,
          body: payload.output,
          ok: Boolean(payload.ok),
        });
        break;
      case "approval_request":
        rows.push({
          key: String(event.id),
          kind: "approval",
          label: `Approval requested: ${payload.name}`,
          body: payload.args,
        });
        break;
      case "usage":
        rows.push({
          key: String(event.id),
          kind: "usage",
          label: `Usage · ${num(payload.total ?? 0)} total tokens`,
          body: payload,
        });
        break;
      case "provider_error":
        rows.push({
          key: String(event.id),
          kind: "error",
          label: `${payload.provider} failed`,
          body: payload.message,
        });
        break;
      case "error":
        rows.push({ key: String(event.id), kind: "error", label: "Run failed", body: payload.message });
        break;
      case "clarify":
        rows.push({ key: String(event.id), kind: "notice", label: "Question asked", body: payload.question });
        break;
      case "delegate_started":
        rows.push({ key: String(event.id), kind: "notice", label: "Delegated", body: payload.label });
        break;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Run trace"
        title={session?.title ?? run.input ?? "Run"}
        description={run.input ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={run.status} />
            {session && (
              <Link href={`/chat/${session.id}`} className="btn btn-sm">
                Open session
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-flat px-4 py-3">
          <p className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Steps</p>
          <p className="mt-1 text-[1.3rem] leading-none font-medium">
            {run.step}/{run.maxSteps}
          </p>
        </div>
        <div className="card-flat px-4 py-3">
          <p className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Tokens</p>
          <p className="mt-1 text-[1.3rem] leading-none font-medium">{num(run.tokensUsed)}</p>
        </div>
        <div className="card-flat px-4 py-3">
          <p className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Cost</p>
          <p className="mt-1 text-[1.3rem] leading-none font-medium">{money(run.costUsd)}</p>
        </div>
        <div className="card-flat px-4 py-3">
          <p className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Started</p>
          <p className="mt-1 text-[0.8rem] font-medium">{fmtDate(run.startedAt ?? run.createdAt)}</p>
        </div>
      </div>

      {run.error && (
        <div className="mb-5 rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-[0.82rem] text-[var(--danger)]">
          {run.error}
        </div>
      )}

      {text && (
        <div className="card mb-5 p-5">
          <p className="mb-2 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Assistant output
          </p>
          <Markdown text={text} />
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <p className="mb-3 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Timeline
        </p>
        <ol className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn(
                "rounded-[12px] border px-3 py-2.5",
                row.kind === "error"
                  ? "border-[var(--danger)]/30 bg-[var(--danger-soft)]"
                  : row.kind === "approval"
                    ? "border-[var(--hairline)] bg-[var(--butter)]"
                    : "border-[var(--hairline)] bg-[var(--surface-2)]",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    row.ok === false
                      ? "bg-[var(--danger)]"
                      : row.kind === "tool"
                        ? "bg-[var(--accent)]"
                        : "bg-[var(--ink-faint)]",
                  )}
                />
                <p className="text-[0.78rem] font-medium">{row.label}</p>
              </div>
              {row.body !== undefined && row.body !== null && (
                <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-relaxed text-[var(--ink-muted)]">
                  {typeof row.body === "string" ? row.body : JSON.stringify(row.body, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
