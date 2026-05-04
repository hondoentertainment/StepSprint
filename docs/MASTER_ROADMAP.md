# StepSprint master roadmap

Single place to see **where we are**, **what ships next**, and **longer bets**. Detailed requirements stay in [PRD.md](PRD.md); launch checklist in [PRODUCTION.md](PRODUCTION.md); hosting steps in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Current baseline (shipped)

The PRD **core product** is implemented: auth, challenges, teams, submissions, leaderboards, admin moderation and analytics, exports, invites, fitness integrations (Shortcuts + OAuth providers when configured), reminders (email / Web Push when configured), security baseline (CSRF, CSP, rate limits), tests, OpenAPI, i18n (`en` + `es`), and Postgres-ready schema with CI parity.

**Ongoing expectation:** keep `server/prisma/schema.prisma` and `schema.postgresql.prisma` in sync; keep CI green (unit, Postgres job, client, E2E).

---

## Phase 1 — Production launch hardening

*Goal: safe first broad launch on split hosting (e.g. Vercel + Render) with operability and compliance basics.*

| Priority | Item | Notes |
|----------|------|--------|
| P0 | PostgreSQL only in prod | Migrations, backups, documented RTO/RPO ([PRODUCTION.md](PRODUCTION.md)) |
| P0 | Secrets in host stores | `JWT_SECRET`, OAuth, Resend/SMTP, `REMINDER_CRON_SECRET`, VAPID — no secrets in repo |
| P0 | External reminder cron when multi-instance | `REMINDER_USE_EXTERNAL_CRON=true` + hourly `POST /api/cron/reminder-sweep` |
| P0 | Health monitoring | `GET /api/health` + external uptime check; set `SENTRY_RELEASE` / platform git SHA |
| P1 | Client build environment | Align Vercel **Node** with `client` `engines` (e.g. 20.x) to avoid `EBADENGINE` warnings (root `engines.node` + `.nvmrc` pin Vercel/local installs to Node 20) |
| P1 | Sentry | Server `SENTRY_DSN`, client `VITE_SENTRY_DSN`; optional **source map upload** in CI for readable stacks |
| P1 | Email smoke tests | Registration + password reset with real provider after deploy |
| P1 | Legal | Counsel-reviewed Privacy/Terms; real contact details; remove or replace production notice copy in i18n |
| P2 | Staging | Mirror prod-like origins for CSRF/CORS/OAuth redirect validation |

---

## Phase 2 — Reliability, cost, and product polish

*Goal: reduce risk, improve maintainability, and deepen admin/participant value without replatforming.*

| Theme | Examples |
|-------|----------|
| Dependencies | Address **client** high advisories (`vite-plugin-pwa` / Workbox chain) with a **tested** upgrade path; avoid blind `npm audit fix --force` |
| Data & ops | Backup restore drills; tune rate limits if abused; log/metric review |
| Analytics | Stable PostHog event names; dashboards for funnel and retention; optional **churn forecasting** beyond current re-engagement count ([PRD.md](PRD.md)) |
| i18n | Add locales by extending `client/src/i18n`; sweep any remaining hardcoded copy |
| DX | Document “Postgres-first local dev” for contributors who need parity with prod |

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

**Recently completed in-repo:** Node 20 pin (`package.json` `engines`, `.nvmrc`), deployment docs (Vercel/Postgres parity, staging env matrix, reminder cron `curl` example), PRD link to this doc, i18n + locale (Home/Submit/WeekPicker/leaderboards/admin number formatting, `common.notApplicable` for missing rank/leader), optional Sentry source-map upload via `@sentry/vite-plugin`, `ANALYTICS_EVENTS` for stable PostHog names.

_Last reviewed: 2026-05._
