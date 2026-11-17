import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, messages, runs, schedules, sessions } from "@pocket/db";
import { CronExpressionParser } from "cron-parser";
import { kickWorker } from "@/lib/worker";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "enable" | "disable" | "run";
    title?: string;
    cron?: string;
    prompt?: string;
    timezone?: string;
    delivery?: "none" | "telegram" | "discord";
    telegramChatId?: string;
  };

  const db = getDb();
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

  if (body.action === "run") {
    const [session] = await db
      .insert(sessions)
      .values({
        title: `${schedule.title} · manual`,
        source: "schedule",
        telegramChatId: schedule.telegramChatId,
      })
      .returning({ id: sessions.id });

    await db.insert(messages).values({
      sessionId: session.id,
      role: "user",
      content: schedule.prompt,
    });

    const [run] = await db
      .insert(runs)
      .values({
        sessionId: session.id,
        status: "queued",
        input: schedule.prompt,
        source: "schedule",
        checkpoint: {
          scheduleId: schedule.id,
          delivery: schedule.delivery,
          telegramChatId: schedule.telegramChatId,
        },
      })
      .returning({ id: runs.id });

    await db.update(schedules).set({ lastRunAt: new Date() }).where(eq(schedules.id, id));
    kickWorker();
    return NextResponse.json({ ok: true, runId: run.id, sessionId: session.id });
  }

  if (body.action === "enable" || body.action === "disable") {
    const enabled = body.action === "enable";

    if (schedule.kind === "once") {
      if (enabled) {
        if (!schedule.runAt || schedule.runAt.getTime() < Date.now()) {
          return NextResponse.json(
            { error: "This reminder's time has already passed." },
            { status: 400 },
          );
        }
        await db
          .update(schedules)
          .set({ enabled: true, nextRunAt: schedule.runAt })
          .where(eq(schedules.id, id));
      } else {
        await db.update(schedules).set({ enabled: false }).where(eq(schedules.id, id));
      }
      return NextResponse.json({ ok: true, enabled });
    }

    await db
      .update(schedules)
      .set({
        enabled,
        nextRunAt: enabled ? nextRun(schedule.cron, schedule.timezone) : null,
      })
      .where(eq(schedules.id, id));
    return NextResponse.json({ ok: true, enabled });
  }

  // One-time reminders have no cron to recompute; edit only the descriptive fields.
  if (schedule.kind === "once") {
    await db
      .update(schedules)
      .set({
        title: body.title?.trim().slice(0, 120) || schedule.title,
        prompt: body.prompt?.trim().slice(0, 4000) || schedule.prompt,
        delivery: body.delivery ?? schedule.delivery,
        telegramChatId:
          body.telegramChatId === undefined
            ? schedule.telegramChatId
            : body.telegramChatId.trim() || null,
      })
      .where(eq(schedules.id, id));
    return NextResponse.json({
      ok: true,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
    });
  }

  const cron = (body.cron ?? schedule.cron).trim();
  const timezone = (body.timezone ?? schedule.timezone).trim();
  const next = nextRun(cron, timezone);
  if (!next) {
    return NextResponse.json({ error: "That cron expression is not valid." }, { status: 400 });
  }

  await db
    .update(schedules)
    .set({
      title: body.title?.trim().slice(0, 120) || schedule.title,
      cron,
      timezone,
      prompt: body.prompt?.trim().slice(0, 4000) || schedule.prompt,
      delivery: body.delivery ?? schedule.delivery,
      telegramChatId:
        body.telegramChatId === undefined
          ? schedule.telegramChatId
          : body.telegramChatId.trim() || null,
      nextRunAt: next,
    })
    .where(eq(schedules.id, id));

  return NextResponse.json({ ok: true, nextRunAt: next.toISOString() });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  await db.delete(schedules).where(eq(schedules.id, id));
  return NextResponse.json({ ok: true });
}
