import { NextResponse, type NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, schedules } from "@pocket/db";
import { getDefaultTimezone } from "@pocket/core";
import { parseWhen } from "@pocket/shared";
import { CronExpressionParser } from "cron-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextRun(cron: string, timezone: string): Date | null {
  try {
    return CronExpressionParser.parse(cron, { tz: timezone, currentDate: new Date() })
      .next()
      .toDate();
  } catch {
    return null;
  }
}

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(schedules).orderBy(desc(schedules.createdAt)).limit(100);
  return NextResponse.json({ schedules: rows });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: "cron" | "once";
    title?: string;
    cron?: string;
    when?: string;
    runAt?: string;
    prompt?: string;
    timezone?: string;
    delivery?: "none" | "telegram" | "discord";
    telegramChatId?: string;
  };

  const kind = body.kind === "once" ? "once" : "cron";
  const title = (body.title ?? "").trim();
  const cron = (body.cron ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  const timezone = (body.timezone ?? (await getDefaultTimezone())).trim();

  if (title.length < 2) {
    return NextResponse.json({ error: "Give the schedule a title." }, { status: 400 });
  }
  if (prompt.length < 5) {
    return NextResponse.json({ error: "The prompt must describe the task." }, { status: 400 });
  }

  const db = getDb();
  const delivery =
    body.delivery === "telegram" || body.delivery === "discord" ? body.delivery : "none";
  const telegramChatId = body.telegramChatId?.trim() || null;

  if (kind === "once") {
    const when = (body.when ?? body.runAt ?? "").trim();
    if (!when) {
      return NextResponse.json({ error: "Pick a date and time for the reminder." }, { status: 400 });
    }

    const runAt = parseWhen(when, timezone);
    if (!runAt) {
      return NextResponse.json(
        { error: `Could not understand that date and time (${when}).` },
        { status: 400 },
      );
    }
    if (runAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "That time is in the past." }, { status: 400 });
    }

    const [created] = await db
      .insert(schedules)
      .values({
        title,
        kind: "once",
        cron: "",
        runAt,
        timezone,
        prompt,
        delivery,
        telegramChatId,
        enabled: true,
        nextRunAt: runAt,
      })
      .returning({ id: schedules.id });

    return NextResponse.json({
      ok: true,
      id: created.id,
      kind: "once",
      nextRunAt: runAt.toISOString(),
    });
  }

  const next = nextRun(cron, timezone);
  if (!next) {
    return NextResponse.json(
      { error: "That cron expression is not valid. Use 5 fields, e.g. 0 9 * * 1-5." },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(schedules)
    .values({
      title,
      kind: "cron",
      cron,
      timezone,
      prompt,
      delivery,
      telegramChatId,
      enabled: true,
      nextRunAt: next,
    })
    .returning({ id: schedules.id });

  return NextResponse.json({
    ok: true,
    id: created.id,
    kind: "cron",
    nextRunAt: next.toISOString(),
  });
}
