# StepSprint master roadmap

Single place to see **where we are**, **what ships next**, and **longer bets**. Detailed requirements stay in [PRD.md](PRD.md); production-readiness review in [PRODUCTION.md](PRODUCTION.md); hosting steps in [DEPLOYMENT.md](DEPLOYMENT.md); ordered launch-day runbook in [LAUNCH.md](LAUNCH.md).

---

## Current baseline (shipped)

The PRD **core product** is implemented: auth, challenges, teams, submissions, leaderboards, admin moderation and analytics, exports, invites, fitness integrations (Shortcuts + OAuth providers when configured), reminders (email / Web Push when configured), security baseline (CSRF, CSP, rate limits), tests, OpenAPI, i18n (`en` + `es`), and Postgres-ready schema with CI parity.

**Ongoing expectation:** keep `server/prisma/schema.prisma` and `schema.postgresql.prisma` in sync; keep CI green (unit, Postgres parity, client, smoke, E2E).

---

## Phase 1 — Production launch hardening

*Goal: safe first broad launch on a single Vercel project (SPA + Function + Vercel Postgres) with operability and compliance basics.*

### Done in repository (automatable)

| Item | Notes |
|------|--------|
| Single-Vercel deploy shape | [`api/[...all].js`](../api/%5B...all%5D.js) wraps Express; [`vercel.json`](../vercel.json) crons + function config + same-origin CSP |
| Vercel build orchestrator | [`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs) — Postgres schema swap, `prisma generate` + `migrate deploy`, server `tsc`, `vite build` |
| PostgreSQL schema + migrations + CI parity | `server-test-postgres` job; `binaryTargets = ["native", "rhel-openssl-3.0.x"]` for Vercel runtime |
| Bundle hygiene | `prismaClientFactory.ts` lazy-loads `@prisma/adapter-better-sqlite3` so the native binding stays out of the Vercel function bundle |
| Health endpoint | `GET /api/health` returns `release` + `transactionalEmail`; `npm run check:api -- <url> --strict` is a launch gate |
| Node 20 alignment | [`.nvmrc`](../.nvmrc), root `engines`; CI uses `node-version-file: .nvmrc` |
| Same-origin defaults | `APP_ORIGIN`, optional `APP_ORIGIN_ALLOWLIST`, opt-in `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` for staging |
| Reminder cron contract | `GET/POST /api/cron/reminder-sweep`, Vercel Cron entry in `vercel.json`; in-process scheduler auto-disabled when `VERCEL=1`; legacy `scripts/curl-reminder-sweep.sh` kept for non-Vercel hosts |
| Local Postgres DX | `docker-compose.yml`, `npm run postgres:parity` |
| Backup drill doc | [BACKUP_DRILL.md](BACKUP_DRILL.md) |
| CI gates | server-test (SQLite), server-test-postgres, client lint/test/build, smoke (server + **`node scripts/check-api-health.mjs`**), Playwright E2E (desktop Chrome) |
| Prod env validation | Strict startup (Postgres, origins, JWT length, email + `SMTP_FROM`); `/api/health` exposes `transactionalEmail` in production |

### Operator actions (hosting / secrets)

| Priority | Item | Notes |
|----------|------|--------|
| P0 | Create Vercel project + add **Vercel Marketplace Postgres (Neon)** | `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` auto-injected and aliased to `DATABASE_URL` / `DIRECT_URL` by the build script |
| P0 | Set required env in Vercel dashboard | `JWT_SECRET`, `APP_ORIGIN`, `RESEND_API_KEY`, `SMTP_FROM`, `ADMIN_PASSWORD`, `REMINDER_USE_EXTERNAL_CRON=true`, `CRON_SECRET` |
| P0 | First deploy + `npm run check:api -- <url> --strict` | Gates `release`, `transactionalEmail`, CSP, db |
| P1 | Sentry DSNs + optional source maps | `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` |
| P1 | [Post-deploy email smoke](DEPLOYMENT.md#post-deploy-email-smoke-recommended) | After Resend configured |
| P2 | Staging | Vercel Preview + per-preview Neon dev branch (Marketplace setting) |

---

## Phase 2 — Reliability, cost, and product polish

*Goal: reduce risk, improve maintainability, and deepen admin/participant value without replatforming.*

| Theme | Examples |
|-------|----------|
| Dependencies | Address **client** high advisories (`vite-plugin-pwa` / Workbox chain) with a **tested** upgrade path; avoid blind `npm audit fix --force` |
| Data & ops | Backup restore drills; tune rate limits if abused; log/metric review |
| Analytics | Stable PostHog event names; dashboards for funnel and retention; optional **churn forecasting** beyond current re-engagement count ([PRD.md](PRD.md)) |
| i18n | Add locales by extending `client/src/i18n`; sweep any remaining hardcoded copy |
| DX | Postgres parity: [DEPLOYMENT.md](DEPLOYMENT.md) local section + `npm run postgres:parity` |

---

## Phase 3 — Strategic backlog (explicitly out of scope today)

From [PRD.md](PRD.md) **Out of scope** — revisit when business drivers justify the investment.

- Multi-tenancy / white-label
- Native apps beyond PWA (optional future: **Capacitor** shell for HealthKit / Health Connect; not current PWA scope)
- Real-time leaderboards (websockets vs today’s polling)
- Social sharing, badges, and other engagement gamification

---

## How we use this doc

1. **Prioritization:** Phase 1 blocks wide launch; Phase 2 is continuous; Phase 3 is portfolio planning.
2. **Source of truth:** Feature truth lives in the PRD; this file is the **timeline and priority lens**.
3. **Updates:** When a Phase 1 item is done, tick it in your runbook or issue tracker; optionally add a short “last reviewed” line below.

_Last reviewed: 2026-05-04 — API migrated from Render to a single Vercel Function (`api/[...all].js` + `scripts/vercel-build.mjs`); `render.yaml` and `server/Dockerfile` deleted; in-process reminder scheduler auto-disabled on Vercel; `CRON_SECRET` is the canonical cron bearer name (legacy `REMINDER_CRON_SECRET` still accepted); `npm run check:api -- --strict` gates the cutover._
