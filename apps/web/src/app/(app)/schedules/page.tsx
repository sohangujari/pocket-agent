import { desc } from "drizzle-orm";
import { getDb, schedules } from "@pocket/db";
import { getDefaultTimezone } from "@pocket/core";
import { PageHeader } from "@/components/ui";
import { describeChannels } from "@/lib/channels";
import { ScheduleBoard, type ScheduleItem } from "@/components/schedule-board";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const db = getDb();
  const rows = await db.select().from(schedules).orderBy(desc(schedules.createdAt)).limit(100);

  const items: ScheduleItem[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind === "once" ? "once" : "cron",
    cron: s.cron,
    runAt: s.runAt?.toISOString() ?? null,
    timezone: s.timezone,
    prompt: s.prompt,
    delivery: s.delivery,
    telegramChatId: s.telegramChatId,
    enabled: s.enabled,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
  }));

  const active = items.filter((s) => s.enabled).length;
  const channels = await describeChannels();
  const defaultTimezone = await getDefaultTimezone();

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Schedules"
        description="Reminders that fire once and recurring work that runs on the server, whether or not your phone is awake. Each run gets its own session and trace."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip chip-mint">{active} active</span>
            <span className="chip">{items.length} total</span>
          </div>
        }
      />
      <ScheduleBoard
        schedules={items}
        defaultTimezone={defaultTimezone}
        telegramReady={channels.telegram.configured}
        discordReady={channels.discord.configured}
      />
    </div>
  );
}
