import { and, desc, eq, sql } from "drizzle-orm";
import { approvals, getDb, messages, runs, schedules, sessions } from "@pocket/db";
import { executeRun, requeueStaleRuns } from "@pocket/core";
import { buildRegistry } from "@pocket/tools";
import { CronExpressionParser } from "cron-parser";
import { approvalComponents, editDiscordOriginal, sendDiscordFollowup, sendDiscordMessage } from "./discord";
import { ensureBootstrap } from "./bootstrap";
import { inlineKeyboard, sendTelegramMessage } from "./telegram";

let ticking = false;

async function claimRun(): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    update runs
    set status = 'running',
        started_at = coalesce(started_at, now()),
        heartbeat_at = now()
    where id = (
      select id from runs
      where status = 'queued'
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id
  `);
  const list = rows as unknown as { id: string }[];
  return list[0]?.id ?? null;
}

async function processSchedules(): Promise<void> {
  const db = getDb();
  const due = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), sql`${schedules.nextRunAt} <= now()`))
    .limit(3);

  for (const schedule of due) {
    const [session] = await db
      .insert(sessions)
      .values({
        title: schedule.title,
        source: "schedule",
        telegramChatId: schedule.telegramChatId,
      })
      .returning({ id: sessions.id });

    await db.insert(messages).values({
      sessionId: session.id,
      role: "user",
      content: schedule.prompt,
    });

    await db.insert(runs).values({
      sessionId: session.id,
      status: "queued",
      input: schedule.prompt,
      source: "schedule",
      checkpoint: {
        scheduleId: schedule.id,
        delivery: schedule.delivery,
        telegramChatId: schedule.telegramChatId,
      },
    });

    let next: Date | null = null;
    const once = schedule.kind === "once";
    if (!once) {
      try {
        next = CronExpressionParser.parse(schedule.cron, {
          tz: schedule.timezone,
          currentDate: new Date(),
        })
          .next()
          .toDate();
      } catch {
        next = null;
      }
    }

    await db
      .update(schedules)
      .set({
        lastRunAt: new Date(),
        nextRunAt: next,
        // A one-time reminder fires once and then switches itself off.
        enabled: once ? false : next ? schedule.enabled : false,
      })
      .where(eq(schedules.id, schedule.id));
  }
}

async function deliver(runId: string): Promise<void> {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run || run.status !== "completed") return;

  const checkpoint = (run.checkpoint ?? {}) as Record<string, any>;
  if (checkpoint.delivered) return;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, run.sessionId))
    .limit(1);
  if (!session) return;

  const [final] = await db
    .select({ content: messages.content })
    .from(messages)
    .where(and(eq(messages.sessionId, run.sessionId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.seq))
    .limit(1);

  if (!final?.content) return;

  const delivery = checkpoint.delivery;

  // Discord: replace the deferred interaction response when the run came from a
  // slash command, or post into a channel when a schedule targets Discord.
  if (delivery === "discord" || session.source === "discord") {
    if (checkpoint.discordApplicationId && checkpoint.discordInteractionToken) {
      await editDiscordOriginal(
        checkpoint.discordApplicationId,
        checkpoint.discordInteractionToken,
        final.content,
        [],
      );
    } else {
      const channelId = checkpoint.discordChannelId ?? checkpoint.telegramChatId;
      if (!channelId) return;
      await sendDiscordMessage(String(channelId), final.content);
    }
    await db
      .update(runs)
      .set({ checkpoint: { ...checkpoint, delivered: true } })
      .where(eq(runs.id, runId));
    return;
  }

  const chatId = checkpoint.telegramChatId ?? session.telegramChatId;
  const wantsTelegram = delivery === "telegram" || session.source === "telegram";
  if (!chatId || !wantsTelegram) return;

  await sendTelegramMessage(chatId, final.content);
  await db
    .update(runs)
    .set({ checkpoint: { ...checkpoint, delivered: true } })
    .where(eq(runs.id, runId));
}

function approvalSummary(toolName: string, risk: string, input: unknown): string {
  const detail = JSON.stringify(input ?? {}, null, 2);
  return [
    "Approval needed",
    "",
    `Tool: ${toolName} (${risk})`,
    detail.length > 1200 ? `${detail.slice(0, 1200)}…` : detail,
    "",
    "Approve to continue, or reject to skip this step.",
  ].join("\n");
}

/**
 * When a run pauses on a gated tool, push the decision to the channel the run
 * came from so the owner never has to open the web UI to keep it moving.
 */
async function notifyApprovals(runId: string): Promise<void> {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run || run.status !== "awaiting_approval") return;

  const checkpoint = (run.checkpoint ?? {}) as Record<string, any>;
  const notified = new Set<string>(
    Array.isArray(checkpoint.approvalNotifiedIds) ? checkpoint.approvalNotifiedIds : [],
  );

  const pending = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.runId, runId), eq(approvals.decision, "pending")))
    .limit(3);
  const fresh = pending.filter((approval) => !notified.has(approval.id));
  if (fresh.length === 0) return;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, run.sessionId))
    .limit(1);
  if (!session) return;

  const telegramChatId = checkpoint.telegramChatId ?? session.telegramChatId;

  for (const approval of fresh) {
    const text = approvalSummary(approval.toolName, approval.risk, approval.input);

    if (session.source === "telegram" && telegramChatId) {
      await sendTelegramMessage(telegramChatId, text, {
        replyMarkup: inlineKeyboard([
          [
            { text: "Approve", data: `pa:approved:${approval.id}` },
            { text: "Reject", data: `pa:rejected:${approval.id}` },
          ],
        ]),
      });
      continue;
    }

    if (checkpoint.discordApplicationId && checkpoint.discordInteractionToken) {
      await sendDiscordFollowup(
        checkpoint.discordApplicationId,
        checkpoint.discordInteractionToken,
        text,
        approvalComponents(approval.id),
      );
    }
  }

  await db
    .update(runs)
    .set({
      checkpoint: {
        ...checkpoint,
        approvalNotifiedIds: [...notified, ...fresh.map((approval) => approval.id)],
      },
    })
    .where(eq(runs.id, runId));
}

/**
 * One unit of work: requeue dead runs, fire due schedules, execute a run.
 * Safe to call from a timer, a request, or the pg_cron heartbeat.
 */
export async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await ensureBootstrap().catch(() => {});
    await requeueStaleRuns(120);
    await processSchedules();

    for (let i = 0; i < 2; i++) {
      const id = await claimRun();
      if (!id) break;
      await executeRun(id, buildRegistry());
      await notifyApprovals(id).catch((error) => console.error("[approval-notify]", error));
      await deliver(id).catch((error) => console.error("[deliver]", error));
    }
  } catch (error) {
    console.error("[worker]", error);
  } finally {
    ticking = false;
  }
}

const globalForWorker = globalThis as unknown as { __pocketWorkerStarted?: boolean };

export function startWorker(): void {
  if (globalForWorker.__pocketWorkerStarted) return;
  globalForWorker.__pocketWorkerStarted = true;

  setTimeout(() => void tick(), 900);
  setInterval(() => void tick(), 3000);

  console.log("[pocket] worker started");
}

/** Nudge the worker right after a run is created. */
export function kickWorker(): void {
  setTimeout(() => void tick(), 25);
}
