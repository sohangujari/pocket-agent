# Pocket Agent

A personal, autonomous AI agent that lives on a server and is driven from any device — a phone on a 2 GB data plan, a laptop, a terminal, or Telegram.

It is **not** a chat wrapper. Runs are queued in Postgres, executed by a worker, and can be resumed, cancelled, paused for approval, scheduled, and delegated. Memory and skills persist between sessions and improve over time (with your approval).

- **Web UI** — clean, fast, works on low-end phones, installable as a PWA
- **CLI** — `pocket-agent ask "..."`, interactive chat, run inspection
- **HTTP API** — OpenAI-compatible `/api/v1/chat/completions` plus a runs API
- **Telegram & Discord** — talk to the same agent from the chat apps you already use
- **One owner** — no sign-ups, no multi-tenancy, no billing code

---

## How it works

```
   browser / CLI / Telegram / Discord
            │
            ▼
   Next.js app (Render / Docker)
     ├── cookie or API-key auth
     ├── POST /api/chat ──► runs row (status=queued)
     ├── worker claims run ──► core agent loop
     │        ├── OpenAI-compatible providers
     │        ├── 26 tools (memory, skills, web, files, schedules…)
     │        ├── approvals ──► pause, wait, resume
     │        └── events ──► run_events
     ├── SSE /api/runs/:id/stream?after=cursor
     └── /api/cron/tick (pg_cron heartbeat on free tier)
            │
            ▼
   Supabase Postgres (+ optional Storage for artifacts)
```

Runs are durable. If the process dies mid-run, the row keeps its cursor and the next worker picks it up. That is what makes a free-tier host with cold starts usable.

---

## Quick start

### 1. Database

Create a Supabase project, then copy **Project Settings → Database → Connection string (URI)**. Use the **direct** connection on port `5432` for a long-lived service (Render/Docker), or the pooled `6543` connection if you deploy serverless.

### 2. Configure

```bash
cp .env.example .env
```

Fill in at minimum:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres URI |
| `AUTH_SECRET` | `openssl rand -base64 32` — signs session cookies |
| `MASTER_KEY` | `openssl rand -base64 32` — encrypts provider keys at rest |
| `APP_URL` | Public URL, e.g. `https://pocket-agent.onrender.com` |

`OWNER_PASSWORD` is **optional**. Leave it empty and the first visit asks you to set a dashboard password (stored as a salted scrypt hash in your database). Set it if you prefer to configure the password from the environment instead.

### 3. Migrate

```bash
npm install
npm run db:migrate
```

Migrations live in `supabase/migrations` and are applied in order, once each, inside a transaction. The runner needs the `vector` and `pg_trgm` extensions — both are available on Supabase and on the `pgvector/pgvector` image.

### 4. Run

```bash
npm run dev          # http://localhost:3000
```

Open the URL, choose a password, then go to **Settings → Models** and add a provider key (OpenRouter is the quickest start: one key, every model).

### Or with Docker

```bash
docker compose up --build
```

That starts Postgres (with pgvector) and the app, runs migrations, and serves on port 3000. On first visit you set the dashboard password.

### Or on Render

Push to GitHub, create a Blueprint from `render.yaml`, paste the secrets in the dashboard, deploy. Full walkthrough: [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## First run

1. **Set a dashboard password.** Password + confirm, with a strength meter. It is stored as `scrypt$<salt>$<hash>` under the `owner_password_hash` setting. If a password already exists, `/api/auth/setup` refuses to overwrite it.
2. **Add a model provider.** Settings → Providers. Keys are encrypted with AES-256-GCM using `MASTER_KEY` before they touch the database.
3. **Pick model roles.** Main, fast, summary, vision, review. Each has a fallback chain.
4. **Say hello.** New chat, or `pocket-agent ask "what can you do?"`.

You can change the password later in **Settings → General → Dashboard password**. Changing it does not invalidate existing sessions; sign out if you want to force a re-login.

---

## CLI

```bash
npm run build -w @pocket/cli
npm link -w @pocket/cli        # optional, puts `pocket-agent` on PATH

pocket-agent login --url https://your-app.onrender.com --key pa_...
pocket-agent health
pocket-agent ask "summarise my notes from this week"
pocket-agent chat               # continuous session
pocket-agent runs
pocket-agent show <runId>
pocket-agent cancel <runId>
```

Create the `pa_...` key in **Settings → API keys**. Keys are stored as SHA-256 hashes; the plaintext is shown once. Scopes: `run`, `read`, `admin`.

The CLI talks to `/api/v1/*`, which accepts `Authorization: Bearer pa_...`. The web routes stay cookie-only by design.

---

## API

### Runs API

```bash
# create a run
curl -X POST https://your-app/api/v1/runs \
  -H "authorization: Bearer pa_..." \
  -H "content-type: application/json" \
  -d '{"message":"find three papers on pgvector and summarise them","sessionId":null}'

# tail events
curl -N https://your-app/api/v1/runs/<runId>/events?after=0 \
  -H "authorization: Bearer pa_..."

# decide an approval
curl -X POST https://your-app/api/v1/approvals/<approvalId> \
  -H "authorization: Bearer pa_..." \
  -H "content-type: application/json" \
  -d '{"decision":"approved"}'

# cancel
curl -X POST https://your-app/api/v1/runs/<runId>/cancel \
  -H "authorization: Bearer pa_..."
```

### OpenAI-compatible

```bash
curl https://your-app/api/v1/chat/completions \
  -H "authorization: Bearer pa_..." \
  -H "content-type: application/json" \
  -d '{"model":"pocket-agent","messages":[{"role":"user","content":"hello"}]}'
```

Point any OpenAI client at `https://your-app/api/v1` and it works. Requests run through the full agent loop (tools, memory, approvals auto-policy) rather than a plain completion.

### Web (cookie) routes

`POST /api/chat` → `{ runId, sessionId }`, then `GET /api/runs/:id/stream?after=<cursor>` for SSE. Events are `{ id, type, payload }`; a named `end` event closes the stream. Reconnecting with the last `id` replays anything missed.

---

## Tools

26 tools, grouped into toolsets you can enable per session.

| Group | Tools |
| --- | --- |
| Memory | `memory_add`, `memory_update`, `memory_remove`, `memory_search`, `memory_list`, `memory_propose` |
| Skills | `skill_list`, `skill_view`, `skill_create`, `skill_update` |
| Sessions | `session_search` |
| Web | `web_search`, `web_fetch`, `http_request` |
| Files | `file_write`, `file_read`, `file_list`, `artifact_save` |
| Shell | `terminal` |
| Automation | `schedule_create`, `schedule_list`, `schedule_delete` |
| Orchestration | `delegate_task`, `todo_write`, `clarify` |
| Media | `vision_analyze` |

**Shell is off by default.** Set `EXEC_BACKEND=local` and `EXEC_ALLOWLIST=ls,cat,node` to enable it. Everything dangerous can be gated by approvals (`APPROVAL_MODE=dangerous`, `writes`, or `never`).

Memory is bounded: a pinned core block (~2.2k tokens for the agent, ~1.4k for you) plus full-text search over the rest. Nothing grows without limit.

---

## Deploying on Render's free tier

`render.yaml` is a blueprint: free plan, Node 22, `--max-old-space-size=460`, health check on `/api/health`.

Free instances sleep after ~15 minutes of inactivity and have ~750 hours/month. Pocket Agent is built for that:

- **Durable runs** — a sleeping service resumes queued runs on wake.
- **pg_cron heartbeat** — a Supabase job hits `/api/cron/tick` every minute, which keeps the service awake and drains the queue. One call sets it up:

  ```sql
  select public.pocket_configure_keepalive(
    'https://your-app.onrender.com',
    'your-cron-secret'
  );
  ```

  Remove it with `select public.pocket_disable_keepalive();`. 730 of 750 hours is enough for one service.
- **Reconnecting SSE** — the chat UI reconnects with a cursor, so a cold start or redeploy doesn't lose output.
- **Opportunistic worker kick** — every new run nudges the in-process worker, so you don't wait for the next tick.

If you'd rather not keep it awake, skip the heartbeat; runs simply start when you next open the app.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full checklist, chat channel setup, and troubleshooting.

---

## Repo layout

```
apps/
  web/        Next.js 15 App Router UI + API + worker
  cli/        commander CLI
packages/
  shared/     types, provider presets, crypto, env
  db/         Drizzle schema, client, migration runner
  core/       provider client, agent loop, context, learning
  tools/      26 tool implementations
supabase/
  migrations/ SQL schema, indexes, RLS, keepalive helpers
docs/
  PRD.md      product spec and architecture decisions
  DEPLOY.md   step-by-step deployment
```

TypeScript everywhere, npm workspaces, no build server required.

---

## Security notes

- Single owner. No registration endpoint exists; `ALLOW_SIGNUPS` is a no-op for now.
- Sessions are HS256 JWTs in an `HttpOnly`, `SameSite=Lax` cookie, signed with `AUTH_SECRET`.
- Dashboard password: scrypt with a per-password salt, constant-time comparison.
- Provider API keys: AES-256-GCM at rest, decrypted only in the worker.
- API keys: SHA-256 hashes only; the plaintext is displayed once.
- Approvals are records in Postgres. A run cannot proceed past a gated tool without a decision, whether the decision comes from the UI, the CLI, or Telegram.
- Telegram and Discord are locked to allowlists and authenticated webhooks (secret token / ed25519 signatures).

If you expose this on the public internet, use HTTPS (Render does this for you) and keep `AUTH_SECRET` and `MASTER_KEY` out of git. Rotating `MASTER_KEY` invalidates stored provider keys; re-enter them afterwards.

---

## Status

v0.1 — the full loop works: auth, providers, runs, tools, approvals, memory, skills, schedules, artifacts, CLI, Telegram, Discord, and the PWA. Built to be extended; `packages/core` is deliberately small and readable.

Licence: MIT.
