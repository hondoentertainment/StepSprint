# StepSprint master roadmap

Single place to see **where we are**, **what ships next**, and **longer bets**. Detailed requirements stay in [PRD.md](PRD.md); launch checklist in [PRODUCTION.md](PRODUCTION.md); hosting steps in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Current baseline (shipped)

The PRD **core product** is implemented: auth, challenges, teams, submissions, leaderboards, admin moderation and analytics, exports, invites, fitness integrations (Shortcuts + OAuth providers when configured), reminders (email / Web Push when configured), security baseline (CSRF, CSP, rate limits), tests, OpenAPI, i18n (`en` + `es`), and Postgres-ready schema with CI parity.

**Ongoing expectation:** keep `server/prisma/schema.prisma` and `schema.postgresql.prisma` in sync; keep CI green (unit, Postgres job, Docker image build, client, E2E).

---

## Phase 1 — Production launch hardening

*Goal: safe first broad launch on split hosting (e.g. Vercel + Render) with operability and compliance basics.*

### Done in repository (automatable)

| Item | Notes |
|------|--------|
| PostgreSQL schema + migrations + CI job | `server-test-postgres`; Docker image uses `schema.postgresql.prisma` |
| Blueprint Docker path | [`render.yaml`](../render.yaml): `dockerfilePath: ./server/Dockerfile`, `dockerContext: ./server` |
| Health endpoint | `GET /api/health`; `npm run check:api` |
| Node 20 alignment | [`.nvmrc`](../.nvmrc), root `engines`; CI uses `node-version-file: .nvmrc` |
| CORS | `APP_ORIGIN`, `APP_ORIGIN_ALLOWLIST`, optional `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` |
| Reminder cron contract | `POST /api/cron/reminder-sweep`, [`scripts/curl-reminder-sweep.sh`](../scripts/curl-reminder-sweep.sh) |
| Local Postgres DX | `docker-compose.yml`, `npm run postgres:parity` |
| Backup drill doc | [BACKUP_DRILL.md](BACKUP_DRILL.md) |
| CI gates | `docker-api-image` required for E2E + smoke; Playwright desktop Chrome on PR/push |
| Prod env + health | Strict startup (Postgres, origins, JWT, email + **`SMTP_FROM` when using Resend/SMTP); `/api/health` exposes `transactionalEmail` in production |

### Operator actions (hosting / secrets / legal)

| Priority | Item | Notes |
|----------|------|--------|
| P0 | Provision Render + Postgres | Blueprint apply; verify [`DEPLOYMENT.md`](DEPLOYMENT.md) health check |
| P0 | Secrets only in dashboard | `JWT_SECRET`, Resend/SMTP, OAuth, `REMINDER_CRON_SECRET`, VAPID |
| P0 | Match origins | `APP_ORIGIN`, `VITE_API_URL`, `API_PUBLIC_ORIGIN`, CSP `connect-src` |
| P0 | Multi-instance reminders | `REMINDER_USE_EXTERNAL_CRON` + hourly cron |
| P1 | Sentry DSNs + optional source maps | Env on Render / Vercel |
| P1 | [Post-deploy email smoke](DEPLOYMENT.md#post-deploy-email-smoke-recommended) | After Resend configured |
| P1 | Legal | Counsel copy; `VITE_LEGAL_CONTENT_REVIEWED` or i18n edits |
| P2 | Staging stack | Preview API + `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` or explicit allowlist |

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

_Last reviewed: 2026-05._
