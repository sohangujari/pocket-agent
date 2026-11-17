export function timeAgo(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(seconds)) return "—";
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDate(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function num(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export type Tone = "ok" | "danger" | "butter" | "lavender" | "mint" | "peach" | "neutral";

export function statusTone(status: string): Tone {
  switch (status) {
    case "completed":
    case "active":
    case "approved":
      return "ok";
    case "failed":
    case "cancelled":
    case "rejected":
      return "danger";
    case "running":
      return "lavender";
    case "awaiting_approval":
    case "pending":
      return "butter";
    case "queued":
      return "peach";
    default:
      return "neutral";
  }
}

export function toneClass(tone: Tone): string {
  switch (tone) {
    case "ok":
      return "chip-ok";
    case "danger":
      return "chip-danger";
    case "butter":
      return "chip-butter";
    case "lavender":
      return "chip-lavender";
    case "mint":
      return "chip-mint";
    case "peach":
      return "chip-peach";
    default:
      return "";
  }
}
