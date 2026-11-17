# Deploying Pocket Agent

Three supported paths: **Render** (recommended, free tier works), **Docker** anywhere, or **plain Node** on a VPS. All of them need a Postgres database with the `vector` and `pg_trgm` extensions — Supabase provides both.

The app is a single Next.js process. There is no separate worker or queue service: the worker runs inside the web process and is driven by `runs` rows in Postgres.

---

## 0. Before you start

You need:

- A GitHub account and the repo pushed (the folder may be called `Pocket Agent` locally; name the repo `pocket-agent`).
- A Supabase project (free tier is fine).
- At least one model provider key. OpenRouter is the easiest: one key, many models.
- Two random secrets:

  ```bash
  openssl rand -base64 32   # AUTH_SECRET
  openssl rand -base64 32   # MASTER_KEY
  openssl rand -hex 24      # CRON_SECRET
  ```

Keep `AUTH_SECRET` and `MASTER_KEY` stable. Changing `AUTH_SECRET` signs everyone out; changing `MASTER_KEY` makes stored provider keys undecryptable (re-enter them in Settings).

---

## 1. Supabase

### Create the project

1. <https://supabase.com/dashboard> → **New project**. Pick the region closest to your Render region (Oregon pairs with `us-west-1`).
2. Wait for provisioning.
3. **Project Settings → Database → Connection string → URI**.

Use the **direct** connection (port `5432`) for Render and Docker. It survives long-lived connections and is what the migration runner expects. If you deploy to a serverless platform, use the **pooled** connection (port `6543`) and append `?pgbouncer=true`.

The URI looks like:

```
postgresql://postgres.<ref>:<password>@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

URL-encode any special characters in the password.

### Run migrations

From your machine, with `DATABASE_URL` set:

```bash
npm install
DATABASE_URL="postgresql://..." npm run db:migrate
```

You should see `apply 0000_init.sql ... ok`, then `0001_extras.sql ... ok`, then `Database is up to date.`

If you see `extension "vector" is not available`, you are not on Supabase or a pgvector image. On Supabase, enable it once in **Database → Extensions** (search `vector`), then re-run.

Migrations are idempotent per file: the runner records applied filenames in `_pocket_migrations` and skips them next time. Re-running after a deploy is safe.

### Optional: Storage for artifacts

`artifact_save` writes to Postgres by default. To mirror artifacts to Supabase Storage:

1. **Storage → New bucket** → `pocket-agent` (private).
2. Copy **Project URL**, the **service_role** key, and set:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_STORAGE_BUCKET=pocket-agent
   ```

The database copy is always kept, so Storage is a convenience, not a dependency. Never expose the service role key to the browser.

---

## 2. Render

### Blueprint deploy (recommended)

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
3. Fill in the `sync: false` variables when prompted:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase URI from step 1 |
   | `APP_URL` | `https://<service-name>.onrender.com` |
   | `AUTH_SECRET` | generated above |
   | `MASTER_KEY` | generated above |
   | `CRON_SECRET` | generated above |
   | `OPENROUTER_API_KEY` (or another provider) | your key |

   `OWNER_PASSWORD` is intentionally **not** in the blueprint. Leave it unset and set the dashboard password on first visit. If you'd rather control it from the environment, add it as an env var; it takes precedence only when no database password exists.

4. **Create Web Service**. The first build takes a few minutes (`npm ci` + `next build` on a small instance).
5. When the deploy is live, open the URL. You should see **Set your dashboard password**.

### Manual web service

If you prefer not to use the blueprint:

- **Environment**: Node
- **Build command**: `npm ci --no-audit --no-fund && npm run build`
- **Start command**: `npm run start`
- **Health check path**: `/api/health`
- **Plan**: Free
- **Env vars**: as above, plus
  - `NODE_VERSION=22.11.0`
  - `NODE_OPTIONS=--max-old-space-size=460`
  - `NEXT_TELEMETRY_DISABLED=1`

Migrations: run them from your machine once (step 1), or temporarily set the start command to `npm run db:migrate && npm run start`. Keeping migrations out of the start command makes cold starts faster.

### Free tier behaviour

- The service sleeps after ~15 minutes idle and cold-starts in 30–60 seconds.
- Free plan includes ~750 instance hours/month; one always-on service uses ~730.
- In-flight runs are durable: a sleeping or restarted process resumes from `runs.cursor`.
- The chat UI reconnects its SSE stream with the last event cursor, so a cold start mid-answer does not lose text.
- Every `POST /api/chat` kicks the in-process worker, so you don't wait for a tick.

### Keep the service awake with pg_cron

Supabase can ping the service once a minute. That keeps Render awake and drains the run queue.

In the **Supabase SQL editor**, run once:

```sql
select public.pocket_configure_keepalive(
  'https://<service-name>.onrender.com',
  '<CRON_SECRET>'
);
```

Verify:

```sql
select jobid, jobname, schedule, active from cron.job;
-- and recent runs:
select status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 5;
```

Turn it off:

```sql
select public.pocket_disable_keepalive();
```

`pg_cron` and `pg_net` must be enabled. On Supabase they are available under **Database → Extensions**; enable both if the function errors with `schema "cron" does not exist` or `schema "net" does not exist`.

`/api/cron/tick` also accepts `Authorization: Bearer <CRON_SECRET>` if you'd rather use an external uptime monitor (cron-job.org, UptimeRobot, a GitHub Action). Any scheduler that hits it every 1–5 minutes works.

> The heartbeat is optional. Without it, runs start when you next open the app. With it, schedules and queued runs actually fire on time.

---

## 3. Docker / VPS

```bash
git clone https://github.com/<you>/pocket-agent.git
cd pocket-agent
cp .env.example .env      # fill in DATABASE_URL, AUTH_SECRET, MASTER_KEY, APP_URL
docker compose up -d --build
```

`docker-compose.yml` runs Postgres (`pgvector/pgvector:pg16`) and the app, waits for the database to be healthy, runs migrations, and starts on port 3000.

To use Supabase instead of the bundled Postgres, delete the `db` service and point `DATABASE_URL` at Supabase.

Put a reverse proxy in front for TLS (Caddy is two lines):

```
pocket.example.com {
  reverse_proxy localhost:3000
}
```

Set `APP_URL=https://pocket.example.com`. Cookies are `Secure` when `NODE_ENV=production`, so HTTPS is required in production.

---

## 4. First-run checklist

1. Open the site → **Set your dashboard password** (8+ characters, confirm field, strength meter).
2. **Settings → Providers** → add a provider key (OpenRouter, OpenAI, Anthropic, Gemini, or Z.ai). Keys are encrypted with `MASTER_KEY`.
3. **Settings → Models** → set the main/fast/summary/vision/review roles. Defaults use OpenRouter; change them if you use another provider.
4. **Settings → API keys** → create a `pa_...` key if you want the CLI. Copy it now; it is shown once.
5. Send a test message. You should see a plan, tool calls, and streamed text.
6. Optional: **Settings → System** → check health, run a queue tick manually, review audit log.

---

## 5. Chat channels (optional)

Telegram and Discord are configured from **Channels** in the sidebar (the same panel is also
under **Settings → Channels**). Tokens are encrypted with `MASTER_KEY` and stored in the
`settings` table, so rotating them does not require a redeploy. The environment variables below
still work as a fallback and take effect only when nothing has been saved in the UI.

### Telegram

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the token.
2. Open **Settings → Channels → Telegram**, paste the token and your numeric user ID (find it
   with [@userinfobot](https://t.me/userinfobot)), then **Save**.
3. Click **Generate** next to *Webhook secret* and **Save** again — the secret authenticates
   every webhook call from Telegram.
4. Click **Register webhook**. This calls `setWebhook` with
   `https://<your-app>/api/telegram/webhook` and subscribes to `message` and `callback_query`.
5. Click **Send test**, then message the bot.

Only allowlisted user IDs are answered. Approvals appear as **Approve / Reject** inline buttons
in the chat, and scheduled results can be delivered to Telegram.

### Discord

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **Bot**, copy the token. Under **General Information**, copy the **Public Key** and set
   the **Interactions Endpoint URL** to `https://<your-app>/api/discord/interactions`.
3. In **Settings → Channels → Discord**, paste the token, public key and your Discord user ID
   (Developer Mode → right-click yourself → *Copy User ID*), then **Save**.
4. Click **Register /ask** to publish the `/ask` and `/new` slash commands.
5. Invite the bot to a server with the `bot` and `applications.commands` scopes, then use
   `/ask prompt: summarise my day`.

Discord runs over HTTP interactions (no gateway socket), so it works on a single Render
instance. The initial reply is deferred and the worker edits it when the run finishes; approval
requests arrive with the same Approve / Reject buttons.

### Environment fallback

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_ALLOWED_USER_IDS=123456789
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_ALLOWED_USER_IDS=123456789012345678
```

If you change the webhook secret, re-run **Register webhook**.

Telegram and Discord use the same run pipeline as the web UI, so a run can be watched in all
three places at once. If a bot doesn't respond, check that `APP_URL` is the public `https://`
Render URL and that the allowlist contains numeric IDs (not usernames).

---

## 6. Environment reference

### Required

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres URI, `sslmode=require` for Supabase if your client needs it |
| `AUTH_SECRET` | 32+ random bytes, base64. Signs session cookies |
| `MASTER_KEY` | 32+ random bytes, base64. Encrypts provider keys. Falls back to `AUTH_SECRET` |
| `APP_URL` | Public base URL, no trailing slash |

### Recommended

| Variable | Default | Notes |
| --- | --- | --- |
| `CRON_SECRET` | — | Enables `/api/cron/tick` |
| `OWNER_NAME` | `Owner` | Optional fallback; set the display name in Settings → Profile |
| `OWNER_PASSWORD` | — | Optional env fallback; leave empty for first-run setup |
| `DEFAULT_TIMEZONE` | `Asia/Kolkata` | Used by schedules |
| `AGENT_NAME` | `Pocket Agent` | Displayed in the UI and system prompt |
| `MAX_STEPS` | `24` | Tool loop ceiling per run |
| `MAX_RUN_TOKENS` | `120000` | Hard token ceiling per run |
| `LEARNING_ENABLED` | `true` | Proposes memory/skill updates for approval |
| `APPROVAL_MODE` | `dangerous` | `dangerous` \| `writes` \| `never` |

### Tools

| Variable | Default | Notes |
| --- | --- | --- |
| `EXEC_BACKEND` | `disabled` | `local` enables `terminal` |
| `EXEC_ALLOWLIST` | — | Comma-separated binaries allowed by `terminal` |
| `HTTP_ALLOWLIST` | — | Hosts allowed by `http_request` |
| `SEARCH_PROVIDER` | `none` | `tavily` \| `brave` \| `searxng` |
| `SEARCH_API_KEY` | — | Tavily/Brave key |
| `SEARXNG_URL` | — | Self-hosted SearXNG base URL |

### Providers

`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`. Env keys are a fallback; keys added in the UI are encrypted in the database and take precedence.

---

## 7. Troubleshooting

**"AUTH_SECRET is not set" on every page**
Add `AUTH_SECRET` and redeploy. It is read at request time, not build time, so no rebuild is strictly needed on Render, but a restart is.

**Login says "This dashboard has no password yet"**
No database password and no `OWNER_PASSWORD`. The login page should render the setup form instead. If it doesn't, the database is unreachable — check `DATABASE_URL` and `/api/health`. `passwordState()` falls back to the environment when the DB throws.

**Setup returns 500**
`ensureBootstrap()` or the settings write failed. Check the Render logs; the usual cause is a missing `DATABASE_URL`, an unapplied migration, or an expired Supabase password. Verify with `npm run db:migrate` from your machine.

**"relation \"runs\" does not exist"**
Migrations were never applied. Run `npm run db:migrate` against the production `DATABASE_URL`.

**Runs stay `queued`**
Nothing is ticking. Either open the app (each request kicks the worker), or set up the pg_cron heartbeat, or `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-app/api/cron/tick`.

**Runs fail with provider errors**
The UI shows `provider_error` events and the fallback chain tries the next model. Check **Settings → Providers** for a valid key and **Settings → Models** for a role pointing at a provider you actually configured.

**Cold starts are painful**
Expected on the free tier. The heartbeat removes most of them. Keep `NODE_OPTIONS=--max-old-space-size=460` so the build fits in 512 MB; if the build OOMs, build locally and deploy the Docker image to a paid instance or Fly.io.

**SSE disconnects**
The chat UI reconnects automatically with the last cursor. If it doesn't, check that your proxy does not buffer `text/event-stream` (Render and Caddy don't; nginx needs `proxy_buffering off;`).

**Telegram webhook 401**
The `secret_token` used with `setWebhook` must match `TELEGRAM_WEBHOOK_SECRET` exactly. Re-run `setWebhook` after changing it.

---

## 8. Backups

Everything that matters is in Postgres:

- `sessions`, `messages`, `runs`, `run_events` — conversations and traces
- `memories`, `memory_versions` — long-term memory
- `skills`, `skill_versions` — learned procedures
- `settings`, `provider_configs`, `api_keys` — configuration (secrets encrypted)

Supabase takes daily backups on paid plans; on the free plan you can `pg_dump`:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f pocket-agent-$(date +%F).dump
```

Restore with `pg_restore --clean --if-exists -d "$DATABASE_URL" pocket-agent-*.dump`. After restoring, existing sessions and API keys keep working as long as `AUTH_SECRET` and `MASTER_KEY` are unchanged.
