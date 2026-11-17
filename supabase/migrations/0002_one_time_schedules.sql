-- One-time reminders alongside recurring cron schedules.

alter table "schedules" add column if not exists "kind" text not null default 'cron';
--> statement-breakpoint
alter table "schedules" add column if not exists "run_at" timestamp with time zone;
--> statement-breakpoint
create index if not exists "schedules_kind_next_run_idx" on "schedules" ("kind", "next_run_at");
