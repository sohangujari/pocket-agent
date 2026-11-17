import Link from "next/link";
import { cn } from "@/lib/cn";
import { statusTone, toneClass } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--ink-faint)] mb-2">
            {eyebrow}
          </p>
        )}
        <h1 className="display text-[2rem] sm:text-[2.35rem]">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-[62ch] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "butter" | "mint" | "lavender" | "peach";
}) {
  const fill =
    tone === "butter"
      ? "var(--butter)"
      : tone === "mint"
        ? "var(--mint)"
        : tone === "lavender"
          ? "var(--lavender)"
          : tone === "peach"
            ? "var(--peach)"
            : "var(--surface)";

  return (
    <div
      className="rounded-[var(--r-lg)] border p-4 sm:p-5"
      style={{ background: fill, borderColor: "var(--hairline)" }}
    >
      <p className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-[1.65rem] leading-none font-medium tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-[0.72rem] text-[var(--ink-muted)]">{hint}</p>}
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={cn("chip", toneClass(statusTone(status)))}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-flat flex flex-col items-center justify-center text-center px-6 py-14">
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-3)] text-[var(--ink-muted)]">
          {icon}
        </div>
      )}
      <p className="text-[0.95rem] font-medium">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[42ch] text-[0.82rem] leading-relaxed text-[var(--ink-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  href,
}: {
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
        {title}
      </h2>
      {action && href && (
        <Link href={href} className="text-[0.75rem] text-[var(--ink-muted)] hover:text-[var(--ink)]">
          {action} →
        </Link>
      )}
    </div>
  );
}

export function RiskChip({ risk }: { risk: string }) {
  const tone =
    risk === "dangerous" ? "chip-danger" : risk === "caution" ? "chip-butter" : "chip-ok";
  return <span className={cn("chip", tone)}>{risk}</span>;
}
