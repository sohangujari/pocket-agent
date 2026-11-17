# Pocket Agent — PRD v0.2 & Phased Build Plan

**Date:** 17 Nov 2026 · **Owner:** Sohan · **Supersedes:** v0.1 (9 Nov 2026)

## 1. What changed from v0.1

The v0.1 PRD and the code have drifted apart. v0.2 makes the PRD match what you've built, closes the gaps, and adds a release path with tests.

| Area | v0.1 said | Built / v0.2 decision |
| --- | --- | --- |
| Auth | Supabase Auth, magic link + GitHub | Password setup on first visit, scrypt hash, HS256 cookie, no email. Keep this, but add a setup token (see §3.1). |
| Channels | Telegram only; Discord was a non-goal | Telegram + Discord over HTTP interactions. Accept it, and add the Discord cold-start constraint (§3.2). |
| Tools | 18 | 27 |
| Monorepo | pnpm + Turborepo, packages/ui | npm workspaces, 5 packages, UI inside apps/web. Fine for v1, so drop Turborepo from scope. |
| Providers | Generic OpenAI-compatible | OpenAI, Claude, Gemini, Z.ai and OpenRouter, with per-role models and fallbacks |
| Reminders | Not specified | One-time and recurring, timezone-aware, sticky toast |
| Model names | Hard-coded in .env | Pick them in Settings. The PRD shouldn't pin model IDs because they go stale. |
| "Done" | Undefined | Three levels: Built → Verified locally → Verified live (§2.6) |

Current honest status: almost everything is Built, and some features are Verified locally. Nothing is Verified live. Git has zero commits, so the whole project exists on one disk. That's the first thing to fix.

## 2. Product (v0.2)

### 2.1 Vision (unchanged)

Pocket Agent is a single-owner autonomous agent that runs on a server and is controlled from a cheap phone, a browser, a CLI, Telegram or Discord. The device is only a remote control. All reasoning, tools, memory and scheduling happen server-side.

### 2.2 Goals

- **G1 Does real work.** Multi-step tool loop with approvals, subagents and artifacts.
- **G2 Auditable memory.** Core memory plus searchable history, versioned, and every entry has a reason.
- **G3 Self-improving skills.** Proposed from successful runs, approved by the owner, versioned, usage tracked.
- **G4 Durable on cheap infra.** Render free/Starter + Supabase free. Runs survive restarts, sleep and closed tabs.
- **G5 Low-end first.** ≤150 KB initial JS, ≤80 KB in Lite mode, usable at 360 px, works on 2 GB RAM phones.
- **G6 Safe by default.** Dangerous capabilities start off; side effects need approval; secrets never reach the client.
- **G7 Deploy in under 10 minutes from a fresh clone.**

### 2.3 Non-goals for v1

Desktop app, voice, native mobile apps, multi-tenant/teams/billing, local inference or training, self-hosted Chromium, and any channels beyond Telegram and Discord. Slack, WhatsApp and generic webhooks move to v1.1.

### 2.4 Run lifecycle (now explicit)

```
queued → claimed → running ⇄ awaiting_approval / awaiting_clarify
                      ↓
        succeeded | failed | cancelled | budget_exceeded | interrupted
```

- **Lease:** a worker claims a run with `FOR UPDATE SKIP LOCKED` and writes `lease_expires_at = now()+60s`, renewing it every step. If a lease expires, the run becomes reclaimable.
- **Resume rule:** on reclaim, replay from the last checkpoint. If the crash happened mid-tool and that tool is not idempotent (`http_request`, `terminal`, `schedule_create`, channel sends), don't re-run it. Instead emit `tool_outcome_unknown` and ask the owner.
- **Budgets:** steps (default 24), tokens, USD per run, and USD per day. Hitting any budget sets `budget_exceeded`, which is not the same as failing.

### 2.5 Risk policy (by side effect, not by tool name)

| Class | Examples | Default |
| --- | --- | --- |
| Read-only | `web_search`, `web_fetch`, `memory_search`, `skill_view`, `session_search` | auto |
| Internal write | `file_write`, `artifact_save`, `todo_write` | auto + logged |
| Persistent self-change | `memory_*` writes, `skill_create`/`update`, `schedule_create` | proposal → approval (auto-approve opt-in per class) |
| Outbound side effect | `http_request` non-GET, channel sends from tools | approval |
| Code execution | `terminal`, `code_exec` | approval + sandbox only |

This matters because a fetched web page containing an injected instruction like "remember X" or "schedule Y" should never persist anything without you seeing it.

### 2.6 Definition of done

- **Built:** compiles, typechecks, has unit tests.
- **Verified locally:** passes integration and E2E tests against Docker Postgres with the fake LLM.
- **Verified live:** works on the deployed Render + Supabase instance with real provider and channel tokens, and the phase's live checklist is signed off.

v1.0 ships when every v1 feature is Verified live.

### 2.7 Success metrics

These carry over from v0.1, plus one new metric: **resume success rate**, meaning at least 95% of runs that were killed mid-flight finish correctly after a restart. Every metric must be computable from `runs`, `usage_ledger` and `skill_usage`. If you can't query it, it isn't a metric.

## 3. Gaps and risks in the current build

These are ordered by how badly they'll hurt you.

### 3.1 Owner bootstrap race (critical)

"First visit sets the password" means whoever opens the freshly deployed URL first owns the agent, along with your provider keys and tools. Fix: require `SETUP_TOKEN` from env on the setup page, and disable setup permanently once an owner exists.

### 3.2 Discord on a sleeping Render free instance (high)

Discord requires an interaction response within 3 seconds, but a cold start on Render free can take tens of seconds. Slash commands will fail whenever the service is asleep. Fix options:

- Use Starter ($7).
- Keep the service awake with the pg_cron heartbeat. Check this against Render's current monthly free instance-hour allowance.
- Document the limitation.

Either way, always reply with a deferred response (type 5) and finish the work through a follow-up webhook.

### 3.3 In-process worker inside Next.js (high)

If Render restarts or sleeps the service, in-flight runs die. Leases plus resume (§2.4) cover this, but only once they're tested by actually killing the process.

### 3.4 ephemeral-local exec on Render (critical if enabled)

Commands would run inside the container that holds `MASTER_KEY` and the DB credentials in its env. Fix: refuse `EXEC_BACKEND=ephemeral-local` when `NODE_ENV=production`, so only `disabled` or `e2b` are allowed in prod.

### 3.5 SSRF via http_request / web_fetch (high)

Block private, loopback, link-local and metadata IP ranges after DNS resolution, re-check on every redirect, and cap redirects.

### 3.6 MASTER_KEY loss = all saved keys lost (medium)

Document backing it up, and add key versioning (`enc:v1:`) so you can rotate it later.

### 3.7 DB growth on Supabase free (medium)

`run_events` stores every token delta and will dominate storage. Fix:

- Batch token deltas into chunks of about 200 ms before writing.
- Add a retention job that compacts the events of finished runs older than 30 days into a summary.

### 3.8 Missed schedules during sleep or downtime (medium)

Define a catch-up policy: if a fire time was missed by less than 1 hour, fire once; if by more, skip it and log missed. Never fire the same schedule twice, and enforce that with a unique `(schedule_id, fire_at)` key.

### 3.9 SSE through Render's proxy (medium)

Send a heartbeat comment every 15 s, use `dynamic = 'force-dynamic'` and the Node runtime, and set `X-Accel-Buffering: no`.

### 3.10 No source control, CI or backups (critical, and trivial to fix)

This is Phase 0.

## 4. Phased build plan

Each phase has a goal, build tasks, exit tests, and a "done when" line. Don't start the next phase until the current one's exit tests pass. Phases 0–2 harden what exists, and Phases 3–7 take each feature area from Built to Verified live.

### Phase 0 — Safety net (½–1 day)

**Build**

- Add `.gitignore` (`.env*`, `.next`, `node_modules`), then make an initial commit and push to the remote.
- Run a secret scan before the first push, for example `gitleaks detect`.
- Set up GitHub Actions: `npm ci` → typecheck → lint → unit tests → `next build`.
- Validate env with Zod at boot and fail fast with clear messages.
- Build a `ScriptedProvider`: a fake LLM that returns predefined text and tool calls from a fixture. Every later agent test depends on it.
- Add a test DB using docker-compose Postgres, plus a `test:integration` script that migrates a fresh schema.

**Exit tests**

- Clone the repo fresh on another machine or folder, run `npm ci && docker compose up -d && npm run migrate && npm run dev`, and get to a working login in under 10 minutes.
- CI is green on `main`.
- The secret scan reports nothing.
- One smoke integration test passes: create a run with the `ScriptedProvider` and see it reach `succeeded`.

**Done when:** the code exists somewhere other than your laptop and every push is checked automatically.

### Phase 1 — Live foundation on Render + Supabase (1–2 days)

**Build**

- Add the `SETUP_TOKEN` owner bootstrap (§3.1).
- Make the Supabase migration path a single command, and verify that pg_cron and pg_net are enabled.
- Deploy via `render.yaml`, and make `/api/health` check DB connectivity and the migration version.
- Set up the pg_cron heartbeat to `/api/cron/tick` with `CRON_SECRET`.
- Turn on the production guard for the exec backend (§3.4).

**Exit tests**

- [ ] Deploy from GitHub succeeds and health returns 200 with the DB connected.
- [ ] Setup without the token is rejected; setup with it works; the setup page returns 404 afterwards.
- [ ] Logout, login, an expired cookie and a tampered cookie each behave correctly.
- [ ] `/api/cron/tick` without the secret returns 401, and the pg_cron call shows up in the logs every minute.
- [ ] Let the free instance sleep, then confirm the heartbeat wakes it.
- [ ] Save a provider key, then confirm the client never receives it (inspect the network tab and the API responses).

**Done when:** you can log in to the live URL from your phone.

### Phase 2 — Agent core hardening (3–4 days)

**Build**

- Leases, renewal and stale-lease reclaim.
- The idempotency rule on resume (§2.4).
- Cancellation through an `AbortSignal` that reaches every tool.
- Step, token, run-cost and daily-cost budgets.
- Token delta batching (§3.7).
- SSE heartbeat and `after=seq` replay, plus the 700 ms polling fallback.
- Context compaction.
- Provider fallback on 429 and 5xx errors.

**Exit tests (ScriptedProvider, integration)**

- Multi-step run: 3 tool calls followed by a final answer. Assert the event sequence is exactly as expected.
- Kill test: `kill -9` the server mid-run, restart, and check that the run resumes and finishes with no duplicate side effects.
- Non-idempotent tool killed mid-call results in `tool_outcome_unknown`, not a re-execution.
- Cancel during an LLM stream and during a tool call; both end `cancelled` within 2 s.
- Budgets: the step cap and USD cap both trigger `budget_exceeded`.
- Fallback: the primary provider returns 429, so the fallback model is used and the ledger records both.
- Replay: disconnect the SSE stream at seq 40, reconnect with `after=40`, and receive exactly the missing events.
- Compaction: a 200-turn session stays under the context budget, and the summary row is written.

**Live check:** start a task on your phone, lock the screen for 5 minutes, reopen, and see the complete trace.

### Phase 3 — Tools and safety (3–4 days)

**Build**

- The risk-class approval matrix (§2.5).
- SSRF guard (§3.5).
- Wrap untrusted content in labelled delimiters and run the injection scan on fetched pages.
- Path normalization in the virtual FS.
- Output truncation.
- E2B backend behind the existing gate.

**Exit tests**

- Per-tool contract tests (all 27): valid input succeeds, invalid input gets a Zod error back to the model, and a timeout is enforced.
- Approval matrix: a table-driven test asserts every tool's class and its auto/approve behaviour.
- SSRF suite: `127.0.0.1`, `169.254.169.254`, `10.x`, `[::1]`, a DNS name resolving to a private IP, and a redirect to a private IP must all be blocked.
- Path traversal: `../`, absolute paths and encoded variants must all be rejected.
- Injection fixtures: a page that says "remember my password is…" or "create a schedule…" must produce an approval request and must not write anything.
- `delegate_task`: the concurrency cap of 3 holds, a child can't use tools outside its subset, and the parent gets a summary rather than the child's transcript.

**Live check:** run demo use case 1 (competitor research table) end to end with real search and a real model.

### Phase 4 — Memory and skills learning loop (3 days)

**Build**

- Core memory budgets with forced consolidation proposals.
- A `reflect()` step after runs that uses a cheap model and only creates proposals.
- Version diffs and rollback in the UI.
- Skill index injection (name + description only).
- Recording to `skill_usage`.
- Repeated-correction detection.
- Skill-body injection scan.

**Exit tests**

- Cross-session recall: approve "I deploy on Render and use pnpm", then ask about it in a new session and get it from core memory.
- Overflow: exceed 2,200 chars, and a consolidation proposal appears with nothing silently dropped.
- Rollback: edit a memory twice, roll back to v1, and see the content and a journey event.
- Skill reuse: approve a skill created from a run, then a similar task calls `skill_view` and records usage.
- Reflect stays proposal-only while auto-commit is off; nothing becomes active without approval.
- Malicious skill body ("ignore previous instructions…") is blocked from activation.

**Live check:** demo use cases 3, 4 and 5.

### Phase 5 — Schedules and reminders on real infrastructure (2 days)

**Build**

- The missed-fire policy and unique fire key (§3.8).
- `next_run_at` computed in the schedule's own timezone.
- Delivery routed to the originating channel.
- Disable one-time reminders after they fire (already built, so just verify it).

**Exit tests**

- Unit tests for when parsing across a fixture of 30+ phrases ("tomorrow 9am", "every weekday at 9", "in 20 minutes", "first Monday of the month").
- Timezone checks: `Asia/Kolkata`, plus `America/New_York` across a DST transition. Assert the correct UTC fire times.
- Concurrency: two ticks fire at the same moment and the schedule runs exactly once.
- Missed fire: stop the server for 30 minutes and see a single catch-up; stop it for 2 hours and see it logged missed.
- The toast stays until dismissed and survives a page reload.

**Live check:**

- A 2-minute reminder on Render free arrives while the phone browser is closed.
- A recurring 9 AM schedule fires correctly on 3 consecutive weekdays (demo use case 2).

### Phase 6 — Channels live: Telegram + Discord (2–3 days)

**Build**

- Discord deferred responses plus follow-ups (§3.2).
- Telegram secret-token check and user allowlist (deny all by default).
- Chunking of long messages, and artifacts sent as documents.
- One approval decision honoured across web, Telegram and Discord, so the first one wins and the others show "already decided".

**Exit tests**

- Contract tests with recorded payloads: a valid Discord ed25519 signature is accepted, and an invalid one returns 401. A wrong Telegram secret is rejected, and a user not on the allowlist is ignored silently.
- Approval race: approve on Telegram and reject on web at the same time, and exactly one decision is recorded.
- A 10,000-character answer is chunked correctly in both channels.

**Live checks (real tokens)**

- [ ] `/ask` and `/new` work in Telegram and in Discord.
- [ ] An approval button in Telegram unblocks a run that is visible on web.
- [ ] A Discord slash command sent while Render is asleep still gets a reply. If not, apply the §3.2 decision.
- [ ] A scheduled report arrives in Telegram.

### Phase 7 — PWA and low-end performance (2 days)

**Build**

- A bundle-size check in CI that fails above 150 KB, or above 80 KB in Lite mode.
- An offline shell that caches the last session.
- Lite mode that switches to polling.
- An inline SVG icon sprite.
- Route-level code splitting audit.

**Exit tests**

- Lighthouse mobile run with throttling: Performance ≥ 90 and FCP ≤ 1.8 s.
- Playwright tests at 360 px: chat, approvals, the ⌘K palette (as a button on mobile) and the bottom nav.
- Real device: a 2 GB Android phone (Redmi-class) on 4G can install the PWA, run a task, approve a tool, and read the trace offline.
- Lite mode loads no blur or gradients and uses polling, which you can confirm in the network tab.

### Phase 8 — Hardening and v1.0 release (3 days + 7-day dogfood)

**Build**

- Rate limits on auth, run creation and webhooks.
- Audit log coverage check.
- Error reporting (for example Sentry's free tier).
- `run_events` retention job.
- Backups: a weekly `pg_dump` to Storage or GitHub Actions, plus a documented `MASTER_KEY` backup.
- Update `DEPLOY.md` and the README, and add a CHANGELOG.

**Exit tests**

- Brute-force the login and confirm lockout or throttling kicks in.
- Restore drill: restore the DB from backup into a new Supabase project, and confirm everything works, including decrypting saved keys.
- Audit check: every tool call, approval, memory write and key use has an audit row.
- Run all 6 demo use cases on live infra and get ≥ 80% success.
- 7-day dogfood: use it daily, triage every failure, check cost per run against the `usage_ledger`, and confirm the Supabase project never pauses.

**Release:** tag v1.0.0.

### Timeline at a glance

| Phase | Effort | Cumulative |
| --- | --- | --- |
| 0 Safety net | 0.5–1 d | ~1 d |
| 1 Live foundation | 1–2 d | ~3 d |
| 2 Agent core | 3–4 d | ~7 d |
| 3 Tools & safety | 3–4 d | ~11 d |
| 4 Memory & skills | 3 d | ~14 d |
| 5 Schedules | 2 d | ~16 d |
| 6 Channels | 2–3 d | ~19 d |
| 7 PWA/perf | 2 d | ~21 d |
| 8 Hardening + dogfood | 3 d + 7 d | ~31 d |

Phases 5–7 can overlap once Phase 2 is done.

## 5. Testing strategy

| Layer | Tool | Covers | Runs |
| --- | --- | --- | --- |
| Unit | Vitest | when parsing, cron math, crypto, Zod schemas, risk matrix, SSRF guard | every push |
| Integration | Vitest + Docker Postgres + ScriptedProvider | agent loop, leases, resume, approvals, memory/skills lifecycle | every push |
| Contract | recorded fixtures | Telegram/Discord payloads and signatures, provider response shapes (OpenAI/Anthropic/Gemini-compatible) | every push |
| E2E | Playwright | login, chat, approval, memory edit, schedule create, 360 px layout | every PR |
| Perf | Lighthouse CI + bundle check | JS budget, FCP | every PR |
| Chaos | script | `kill -9` mid-run, DB connection drop, provider 429/500 | before each release |
| Live | manual checklist per phase | real tokens, real devices, sleep/wake | per phase |

**Rules**

- No real LLM calls in CI. The `ScriptedProvider` keeps tests deterministic and free. Keep one optional `test:live-llm` job that you run manually.
- Every bug gets a regression test first, then the fix.
- Seed fixtures live in `packages/db/test/fixtures`: one owner, 2 providers, 3 memories, 2 skills, 2 schedules.

**Release checklist (v1.0)**

- [ ] All features Verified live
- [ ] `SETUP_TOKEN` bootstrap on; signups impossible after the owner exists
- [ ] `EXEC_BACKEND` is `disabled` or `e2b` in production
- [ ] SSRF, path traversal and injection suites green
- [ ] Backup and restore drill done; `MASTER_KEY` stored offline
- [ ] Bundle ≤ 150 KB / Lite ≤ 80 KB
- [ ] Dogfood week completed with no critical bugs open
- [ ] Discord sleep behaviour decided and documented
- [ ] `DEPLOY.md` tested by following it on a brand-new Supabase project

## 6. Resolved decisions (from v0.1 §21)

- **Stack:** TypeScript monorepo, decided and built.
- **Default provider:** OpenRouter as the onboarding default, since one key unlocks many models, with direct providers as alternatives.
- **Execution:** disabled by default; E2B is the only production backend.
- **Tenancy:** single owner.
- **Channels:** Telegram + Discord in v1, with Discord behaviour on sleep explicitly decided in Phase 6.

## 7. The phases (summary)

| # | Phase | Goal | Key exit test |
| --- | --- | --- | --- |
| 0 | Safety net | Get the code into git, with CI and a fake LLM for tests | A fresh clone runs in under 10 min, and CI is green |
| 1 | Live foundation | Running on Render + Supabase | You can log in to the live URL from your phone |
| 2 | Agent core hardening | Runs that survive crashes, sleep and disconnects | `kill -9` mid-run, and the run resumes with no duplicate actions |
| 3 | Tools and safety | All 27 tools tested and safe | The SSRF, path-traversal and injection suites pass |
| 4 | Memory and skills | The learning loop works end to end | A fact is recalled across sessions, and the agent reuses a skill it created |
| 5 | Schedules and reminders | Reliable on real infra | A reminder arrives while the phone is off, and nothing fires twice |
| 6 | Channels live | Telegram and Discord work with real tokens | An approval in Telegram unblocks a run you can see on web |
| 7 | PWA and performance | Works on low-end phones | Lighthouse ≥ 90 and a real 2 GB phone test passes |
| 8 | Hardening and v1.0 | Ready to release | Backup restore drill, plus 7 days of daily use |

Three more phases (9–11) cover reaching Hermes level and going beyond it.

## 8. New features and improvements added in v0.2

### Safety and security

- Setup token for owner bootstrap. Right now, whoever opens the URL first after deploy becomes the owner.
- Risk policy by side effect rather than by tool name. Anything that writes memory, creates a schedule or makes an outbound call needs approval. This stops injected web pages from changing the agent.
- SSRF guard on `http_request` and `web_fetch`. It blocks private and metadata IPs, including after redirects.
- Production guard that refuses ephemeral-local shell, so commands can never run next to your secrets.
- Key versioning for `MASTER_KEY` rotation, plus a documented backup.

### Reliability

- Explicit run states: `queued`, `running`, `awaiting approval`, `succeeded`, `failed`, `cancelled`, `budget_exceeded`, `interrupted`.
- Leases with stale-run reclaim, and an idempotency rule on resume. Non-repeatable tools are never re-run after a crash; the agent asks you instead.
- Budgets: steps, tokens, USD per run and USD per day.
- Missed-schedule policy: catch up once if less than 1 hour late, otherwise log it as missed. A unique key prevents double fires.
- Discord cold-start fix: a deferred response plus a follow-up.
- SSE heartbeat so Render's proxy doesn't cut streams.

### Operations

- Token delta batching and a `run_events` retention job, so the Supabase free DB doesn't fill up.
- Weekly backups and a restore drill.
- Error reporting and a 7-day dogfood period before tagging v1.0.

### Process

- "Done" has three levels: Built → Verified locally → Verified live.
- `ScriptedProvider`: a fake LLM so agent tests are deterministic and cost nothing.
- Bundle-size check in CI.
- A new metric, resume success rate: at least 95%.

## 9. Working on any device

The core idea is still that the device is only a remote control, so the goal is to support every way someone might reach it.

| Device / situation | How it works | Add if missing |
| --- | --- | --- |
| Low-end Android (2 GB, old Chrome) | PWA in Lite mode, polling, ≤80 KB JS | Make sure it works on older browsers, and fall back to plain text when a feature is unsupported |
| iPhone / Safari | PWA | iOS limits background SSE, so use replay on resume. Web Push works only after "Add to Home Screen". |
| Feature phone / no browser | Telegram, or SMS later | Telegram Lite works on very weak devices |
| Desktop browser | Full UI, ⌘K | Keyboard shortcuts for approvals |
| Terminal / SSH box / Termux | `pocket-agent` CLI (pure HTTP) | `--json` output, and a single-file binary via `bun build --compile` |
| Smartwatch / car | Telegram notifications | Short-answer mode for notifications |
| Offline | Cached last session, queued messages | Outbox: prompts typed offline are sent when you're back online |
| Slow or flaky 2G/3G | Event replay by cursor | Gzip/Brotli, compact event payloads, image previews off in Lite mode |
| Shared or public computer | Short-lived session | "Log out everywhere" and session list in Settings |

New features for this:

- Web Push notifications for approvals and finished runs, so you don't need Telegram.
- Offline outbox.
- Approval links: a signed one-time link in a notification lets you approve from any device without logging in.
- Accessibility: large-text mode, screen-reader labels, and reduced motion.
- Hindi and other Indian languages in the UI. The agent already speaks them, so only the UI strings need translating.

## 10. Reaching Hermes level

Hermes Agent sets a high bar. It's an open-source, self-improving agent by Nous Research with a built-in learning loop, autonomous skill creation and refinement, cross-session memory, a multi-platform messaging gateway and scheduled automations. Its memory side includes periodic memory nudges, skills that improve themselves during use, FTS5 cross-session recall and Honcho user modeling, and it ships six terminal backends. Recent releases added streaming voice, on-device wake words, an agent-to-agent protocol, signed webhooks and desktop plugins. It also has research features such as batch processing, trajectory export and RL training with Atropos.

Where Pocket Agent already matches Hermes: the memory + skills learning loop, cron delivered to channels, subagents, multiple providers, session search, and Telegram/Discord.

Gaps, which become **Phase 9 (Hermes parity, ~3–4 weeks)**:

| Hermes has | Pocket Agent plan |
| --- | --- |
| Skills that improve during use | Mid-run skill patch proposals when a step fails and is then fixed, not just after-run reflection |
| Periodic memory nudges | A weekly "memory review" job: merge duplicates, flag stale facts, ask you to confirm |
| User modeling (Honcho) | A `user_model` table of inferred preferences with confidence scores, all visible and editable |
| MCP | An MCP server manager UI (HTTP/SSE servers; stdio isn't practical on Render) |
| Browser automation | Firecrawl/Browserbase backend with a session vault |
| Multiple terminal backends | E2B now, with Daytona/Modal behind the same interface |
| Voice | Telegram voice notes in (speech-to-text) and voice replies out (text-to-speech) |
| Skills Hub | Import/export using the Agent Skills format, compatible with Hermes skills |
| Agent-to-agent | Expose an A2A endpoint so other agents (including Hermes) can call Pocket Agent |
| More platforms | Slack, WhatsApp (Cloud API), email in/out, generic signed webhook |

Phase 9 test: run the same 10 tasks on Hermes and Pocket Agent with the same model, then compare success rate, steps, tokens and cost. That gives you a real benchmark instead of a claim.

## 11. Going beyond Hermes (Phases 10–11)

Don't try to beat Hermes everywhere. They have a large team, and you're one builder. Win where your architecture is naturally stronger.

### Phase 10 — Where Pocket Agent beats Hermes by design (~3 weeks)

- **Works while every device is off.** Hermes is local-first, with memory stored in `~/.hermes/` on your machine. Pocket Agent's server-side, DB-backed runs are your biggest advantage, so lean into it.
- **Full run replay and time travel.** Open any past run, see every step, and fork from step N with a different instruction or model. That's very hard to do with local files.
- **Approve from anywhere.** One approval shared across web, Telegram, Discord, push notifications and signed links.
- **Explainable memory.** For every fact: "learned from this run, on this date, approved by you", with one-tap undo.
- **Cost control built in:** per-run and daily caps, a cost forecast before long tasks, and automatic routing of simple steps to cheap models.
- **Skill success analytics:** success rate, average cost and last failure per skill, with low performers flagged for auto-improvement.
- **Zero-install on any device,** including ARMv7 phones that Hermes can't run on.

### Phase 11 — Next-level autonomy (~4 weeks)

- **Goals, not just tasks.** "Keep my competitor sheet updated weekly": the agent plans recurring work, tracks progress and reports.
- **Triggers besides time:** an RSS item, a webhook, an email or a price change can start a run.
- **Self-evaluation:** a review model checks important outputs before delivery, and the result is shown in the trace.
- **Skill testing:** each skill gets example inputs and expected checks, and new versions must pass them before activation. Hermes doesn't gate skill updates this way.
- **Named specialist agents** (Researcher, Coder, Ops), each with its own memory and skills, which the main agent delegates to.
- **Weekly digest:** what it did, what it learned, what it cost, and what failed.

## 12. Recommended order

Phases 0–8: finish v1 properly, about 1 month. Nothing below matters if runs aren't reliable live.

Phase 10 items 1–4: your differentiators, and cheap because you've already built most of the plumbing.

Phase 9 parity, picking the items you'll actually use first: probably MCP, voice notes and WhatsApp.

Phase 11 once you've had about a month of daily use and know what you want automated.
