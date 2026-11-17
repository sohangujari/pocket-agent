/**
 * Small timezone helpers. No dependency: Intl gives us the wall clock in any
 * IANA zone, and we derive the offset from it.
 */

/** Offset of `timeZone` at `instant`, in milliseconds (positive east of UTC). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Convert a wall-clock time in `timeZone` to the corresponding UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Second pass settles DST boundaries.
  ts = guess - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const ZONED_RE = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parse a time the user (or the model) wrote.
 *
 *   "2026-11-10 13:28"          → wall clock in `timeZone`
 *   "2026-11-10T13:28:00+05:30" → explicit offset, used as-is
 *   "2026-11-10T07:58:00Z"      → explicit UTC
 */
export function parseWhen(input: string, timeZone: string): Date | null {
  const value = input.trim();
  if (!value) return null;

  if (LOCAL_RE.test(value)) {
    const [, y, mo, d, h, mi] = LOCAL_RE.exec(value)!;
    return zonedTimeToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), timeZone);
  }

  if (ZONED_RE.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function isValidTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Human label for the current time, e.g. "Tuesday 10 November 2026 at 13:05". */export function localTimeLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}
