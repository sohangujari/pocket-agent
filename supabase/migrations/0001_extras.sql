-- Pocket Agent: search, security and scheduling extras.
-- Applied after 0000_init.sql by `npm run db:migrate`.

-- ------------------------------------------------------------ skill status
alter table skills add column if not exists status text not null default 'active';
create index if not exists skills_status_idx on skills (status, enabled);

--> statement-breakpoint

-- ---------------------------------------------------------------- full text
alter table messages
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists messages_content_fts_idx on messages using gin (content_tsv);

alter table memories
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists memories_content_fts_idx on memories using gin (content_tsv);
create index if not exists memories_content_trgm_idx on memories using gin (content gin_trgm_ops);

create index if not exists sessions_title_trgm_idx on sessions using gin (title gin_trgm_ops);
create index if not exists skills_name_trgm_idx on skills using gin (name gin_trgm_ops);

--> statement-breakpoint

-- ------------------------------------------------------------- vector index
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    create index if not exists memories_embedding_idx
      on memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
  end if;
end $$;

--> statement-breakpoint

-- ------------------------------------------------------------------- RLS
-- All database access happens server-side with the Postgres owner role.
-- Enabling RLS with no permissive policies means the Supabase anon and
-- authenticated keys cannot read or write anything directly.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

--> statement-breakpoint

-- ------------------------------------------------------------ keepalive
-- Optional but recommended on Render's free tier: a pg_cron job pings the
-- service every minute, which keeps it awake and drains the run queue.
--
-- After deploying, run this once in the Supabase SQL editor:
--   select public.pocket_configure_keepalive('https://your-app.onrender.com', 'your-cron-secret');
--
-- Remove it with:
--   select public.pocket_disable_keepalive();
create or replace function public.pocket_configure_keepalive(p_url text, p_secret text)
returns void
language plpgsql
security definer
as $$
begin
  execute format('alter database %I set app.pocket_url = %L', current_database(), p_url);
  execute format('alter database %I set app.pocket_cron_secret = %L', current_database(), p_secret);

  begin
    perform cron.unschedule('pocket-agent-tick');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'pocket-agent-tick',
    '* * * * *',
    $job$
      select net.http_post(
        url := current_setting('app.pocket_url') || '/api/cron/tick',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-cron-secret', current_setting('app.pocket_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 8000
      );
    $job$
  );
end $$;

create or replace function public.pocket_disable_keepalive()
returns void
language plpgsql
security definer
as $$
begin
  perform cron.unschedule('pocket-agent-tick');
exception when others then
  null;
end $$;

--> statement-breakpoint

-- ------------------------------------------------------------- helpers
create or replace function public.pocket_touch_session(p_session uuid)
returns void
language sql
as $$
  update sessions set updated_at = now() where id = p_session;
$$;
