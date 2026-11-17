import { desc, eq, or } from "drizzle-orm";
import { getDb, schedules } from "@pocket/db";
import { CronExpressionParser } from "cron-parser";
import { parseWhen } from "@pocket/shared";
import { getDefaultTimezone } from "@pocket/core";
import { z } from "zod";
import { defineTool } from "./helpers.js";

function nextRun(cron: string, timezone: string): Date {
  const interval = CronExpressionParser.parse(cron, {
    tz: timezone,
    currentDate: new Date(),
  });
  return interval.next().toDate();
}

export const scheduleCreate = defineTool({
  name: "schedule_create",
  description:
    "Schedule a task or reminder. Use `when` for a one-time reminder (local date and time, e.g. '2026-11-10 13:28') or `cron` for a recurring task — exactly one of the two. The agent runs the prompt in a fresh session at that time. Delivery 'telegram' sends the result to the owner's Telegram chat.",
  schema: z.object({
    title: z.string().min(2).max(120),
    prompt: z
      .string()
      .min(5)
      .max(4000)
      .describe("What to do at that time. For a reminder, write the message to send."),
    when: z
      .string()
      .max(40)
      .optional()
      .describe(
        "One-time reminder: the owner's local date and time, e.g. '2026-11-10 13:28'. Omit when using cron.",
      ),
    cron: z
      .string()
      .min(5)
      .max(80)
      .optional()
      .describe("Recurring 5-field cron, e.g. '0 9 * * 1-5'. Omit for a one-time reminder."),
    timezone: z
      .string()
      .optional()
      .describe("IANA zone, e.g. 'Asia/Kolkata'. Omit to use the owner's default."),
    delivery: z.enum(["none", "telegram", "discord"]).default("none"),
  }),
  risk: "caution",
  toolsets: ["automation"],
  label: "Scheduling a task",
  async run(input) {
    const when = input.when?.trim();
    const cron = input.cron?.trim();

    if (Boolean(when) === Boolean(cron)) {
      return {
        created: false,
        error:
          "Provide exactly one of `when` (one-time reminder, e.g. '2026-11-10 13:28') or `cron` (recurring).",
      };
    }

    const db = getDb();
    const timezone = input.timezone?.trim() || (await getDefaultTimezone());

    if (when) {
      const runAt = parseWhen(when, timezone);
      if (!runAt) {
        return {
          created: false,
          error: `Could not understand the time "${when}". Use 'YYYY-MM-DD HH:MM' in ${timezone}.`,
        };
      }
      if (runAt.getTime() < Date.now() - 60_000) {
        return {
          created: false,
          error: `That time is in the past (${runAt.toISOString()}). Check today's date and try again.`,
        };
      }

      const [created] = await db
        .insert(schedules)
        .values({
          title: input.title,
          kind: "once",
          cron: "",
          runAt,
          timezone,
          prompt: input.prompt,
          delivery: input.delivery,
          enabled: true,
          nextRunAt: runAt,
        })
        .returning({ id: schedules.id });

      return {
        created: true,
        kind: "once",
        id: created.id,
        runAt: runAt.toISOString(),
        inMinutes: Math.max(0, Math.round((runAt.getTime() - Date.now()) / 60_000)),
      };
    }

    let next: Date;
    try {
      next = nextRun(cron!, timezone);
    } catch (error) {
      return {
        created: false,
        error: `Invalid cron expression: ${error instanceof Error ? error.message : "parse failed"}`,
      };
    }

    const [created] = await db
      .insert(schedules)
      .values({
        title: input.title,
        kind: "cron",
        cron: cron!,
        timezone,
        prompt: input.prompt,
        delivery: input.delivery,
        enabled: true,
        nextRunAt: next,
      })
      .returning({ id: schedules.id });

    return { created: true, kind: "cron", id: created.id, nextRunAt: next.toISOString() };
  },
});

export const scheduleList = defineTool({
  name: "schedule_list",
  description: "List scheduled tasks and reminders, including when they run next.",
  schema: z.object({}),
  risk: "safe",
  toolsets: ["automation"],
  label: "Listing schedules",
  async run() {
    const db = getDb();
    const rows = await db
      .select({
        id: schedules.id,
        title: schedules.title,
        kind: schedules.kind,
        cron: schedules.cron,
        runAt: schedules.runAt,
        timezone: schedules.timezone,
        delivery: schedules.delivery,
        enabled: schedules.enabled,
        nextRunAt: schedules.nextRunAt,
        lastRunAt: schedules.lastRunAt,
      })
      .from(schedules)
      .orderBy(desc(schedules.createdAt))
      .limit(60);
    return { schedules: rows };
  },
});

export const scheduleDelete = defineTool({
  name: "schedule_delete",
  description: "Delete a scheduled task or reminder by id or exact title.",
  schema: z.object({
    id: z.string().uuid().optional(),
    title: z.string().optional(),
  }),
  risk: "caution",
  toolsets: ["automation"],
  label: "Deleting a schedule",
  async run(input) {
    if (!input.id && !input.title) return { deleted: false, error: "Provide an id or title." };
    const db = getDb();
    const rows = await db
      .delete(schedules)
      .where(
        input.id
          ? eq(schedules.id, input.id)
          : or(eq(schedules.title, input.title!), eq(schedules.title, input.title!.toLowerCase())),
      )
      .returning({ id: schedules.id });
    return { deleted: rows.length > 0, count: rows.length };
  },
});
