-- Chat gateways beyond Telegram need a per-chat session key that is not a
-- Telegram chat id. Discord uses "discord:<channel>:<user>".

alter table "sessions" add column if not exists "channel_chat_id" text;
--> statement-breakpoint
create index if not exists "sessions_channel_chat_idx" on "sessions" ("channel_chat_id");
--> statement-breakpoint

-- Chat gateway credentials live in settings so they can be rotated from the UI
-- without a redeploy. Both keys are excluded from the settings API response.
insert into "settings" ("key", "value")
values ('channels', '{}'::jsonb)
on conflict ("key") do nothing;
