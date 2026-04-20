# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

StepSprint is a month-long step-challenge platform with teams, daily step submissions, weekly/monthly leaderboards, and an admin console. Monorepo with a React client, Express API, and Prisma database (SQLite in dev, Postgres planned for prod).

Note: `package.json` still names the root workspace `schaffer-shufflers` — legacy demo name. User-facing product name is **StepSprint**.

## Workspace layout

```
client/             Vite + React 19 + TypeScript frontend (React Router 7)
  public/icons/     PWA icons (192, 512)
  tests/            Playwright specs (desktop + mobile)
server/             Express 5 + TypeScript API (JWT auth, Zod validation)
  prisma/           Canonical Prisma schema (SQLite active;
                    Postgres variant at schema.postgresql.prisma), migrations
  src/              App code, routes, middleware, logger, sentry, openapi
  src/seed.ts       Seed entry point (wired via server/prisma.config.ts)
  Dockerfile        Multi-stage server image (targets Postgres prod)
docs/               Screenshots, DEPLOYMENT.md, design notes
.github/workflows/  CI (server + client tests + lint + build)
render.yaml         Render.com blueprint (web service + Postgres)
vercel.json         Frontend deploy config
```

## Commands

Run from repo root unless stated:

```bash
npm test                # client + server unit/integration (Vitest)
npm run test:coverage   # both with coverage
npm run test:e2e        # Playwright (desktop + Pixel 5 + iPhone 13)
npm run lint            # client eslint
npm run build           # client + server build
```

Per-workspace:

```bash
cd server && npm run dev          # API on :3001 (tsx watch)
cd server && npm run db:migrate   # prisma migrate dev
cd server && npm run db:seed      # admin + sample users + demo challenge
cd client && npm run dev          # Vite on :5173
cd client && npm run lint         # eslint
cd client && npm run build        # tsc -b && vite build (emits PWA SW)
cd client && npm run test:e2e:ui  # Playwright UI mode
```

Required env (see `.env.example`):
- `JWT_SECRET` — min 16 chars
- `DATABASE_URL` — defaults to `file:./dev.db` (SQLite)
- `APP_ORIGIN` — CORS origin for the client
- Optional: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `LOG_LEVEL`, SMTP vars

Seed users after `db:seed`:
- Admin: `admin@stepsprint.local`
- Participant (used by E2E): `user1@stepsprint.local`
- Password (all seeded users): `password123`

## Architecture

### Server (`server/src`)
- `app.ts` / `index.ts` — Express wiring: helmet → pino-http (request IDs) → rate limiters → CORS → JSON → routes → Sentry error handler → 404
- `routes/` — modular routers: `auth`, `admin`, `challenges`, `submissions`, `leaderboards`, `summary`, `analytics`, `invites`, `notifications`, `integrations`, `openapi`. Tests colocate (`*.test.ts`, Supertest)
- `middleware/auth.ts` — JWT verification + role gates (`ADMIN` / `PARTICIPANT`)
- `middleware/rateLimit.ts` — four tiers: `authLimiter`, `apiLimiter`, `generalLimiter`, `passwordResetLimiter` (prod only)
- `logger.ts` — pino (pretty in dev, JSON in prod), level from `LOG_LEVEL`
- `sentry.ts` — `initSentry()`; no-op without `SENTRY_DSN`
- `openapi.ts` + `routes/openapi.ts` — OpenAPI 3 spec at `/api/openapi.json`, Swagger UI at `/api/docs`
- `config.ts` — Zod-validated env loader (`JWT_SECRET`, `DATABASE_URL`, `APP_ORIGIN`, `SENTRY_DSN`, `NODE_ENV`)
- `services/` — email (Nodemailer; no real SMTP provider configured)
- `utils/` — Luxon date helpers, bcrypt, reset tokens
- `prisma.ts` — Prisma client via `@prisma/adapter-better-sqlite3`, reads `DATABASE_URL`
- Input validation: Zod schemas on every mutating route
- Errors: custom `ApiError` class; central handler converts to JSON

### Client (`client/src`)
- `main.tsx` — `initSentry()` → React root wrapped in `ErrorBoundary` → `<App>`; registers PWA SW in prod
- `App.tsx` — router + providers; admin/leaderboard/standings routes are `React.lazy` code-split with `<Suspense>` fallback
- `api.ts` — fetch wrapper, `ApiError`, auth token handling
- `components/` — page-level (`Home`, `Admin`, `Login`, `WeeklyLeaderboard`, `Submit`, `TeamStandings`, `InvitePage`, `ForgotPassword`, `ResetPassword`) and UI (`Layout`, `ConfirmDialog`, `WeekPicker`, `ErrorBoundary`)
- `contexts/` — `WeekContext` for the selected calendar week
- `hooks/` — `useAuth`, `useChallenges`, etc.
- `sentry.ts` — `initSentry()` + `captureException` helper; `ErrorBoundary.componentDidCatch` forwards here
- `analytics.ts` — `track()` / `identify()` abstraction; lazy-imports `posthog-js` only if `VITE_POSTHOG_KEY` set; wired in `Login` (identify on success), `Submit` (track on submission), `Home` (track on challenge view)
- `i18n/` — react-i18next setup; `en.json` with Login page strings (other components still hardcoded)
- Styling: CSS-in-JS + `App.css` / `index.css`; no UI framework
- PWA: `vite-plugin-pwa` with `registerType: 'autoUpdate'`; manifest inlined in vite.config; icons in `public/icons/`

### Data model (Prisma)
`User` (role), `Challenge` (month-scoped, timezone, `inviteCode`, `inviteCodeExpiresAt`), `Team`, `TeamMember`, `StepSubmission` (unique on `userId+challengeId+date`), `PasswordResetToken`, `AuditLog`, `NotificationPreference`.

Team assignment supports random and snake-draft at challenge creation.

### CI / Deploy
- `.github/workflows/ci.yml` — server tests (prisma push + seed + vitest) and client (lint + test + build) on PR and push.
- Client deploys to Vercel via the existing workflow.
- Server deploy: `render.yaml` + `server/Dockerfile` — blueprint-ready; not yet provisioned. Postgres is the intended prod DB; `schema.postgresql.prisma` is the target schema.

## Conventions

- **TypeScript strict** in both workspaces — don't loosen it.
- **Zod first**: validate every request body/params; derive types from schemas where practical; register the Zod schema with OpenAPI where public.
- **Timezone-aware dates**: use Luxon and the helpers in `server/src/utils` — never `new Date()` for challenge-day arithmetic.
- **Tests colocate**: server tests sit beside routes as `*.test.ts`; client unit tests as `*.test.tsx`; Playwright specs live under `client/tests/`.
- **Audit admin writes**: admin mutations should append to `AuditLog`.
- **Prisma transactions** for multi-row writes (team allocation, submission edits).
- **Error handling**: throw `ApiError` on the server; catch `ApiError` in the client `api.ts` layer and surface typed messages; the client `ErrorBoundary` forwards render-time errors to Sentry.
- **Logging**: use the exported `logger` (pino) — no `console.log` in production code paths.
- **Analytics**: use `track()` / `identify()` from `client/src/analytics.ts`; keep event names stable (they're a public-ish contract for PostHog dashboards).
- **No emojis** in code or UI unless the user asks.

## Known gaps / gotchas

- **Sentry and PostHog are no-ops in dev**: SDKs wired but silent until `SENTRY_DSN` / `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` are set.
- **No real SMTP provider**: Nodemailer wired, password reset emails no-op without SMTP env.
- **i18n coverage is thin**: only `Login` is translated via `useTranslation`; all other components still hardcode English.
- **Health-sync integrations** (Apple Health / Google Fit / Fitbit): `routes/integrations.ts` is scaffolding; no OAuth flows yet.
- **Push notifications**: daily reminders are email-only; no Web Push / VAPID yet.
- **CSP not pinned**: helmet defaults are on but CSP is disabled — lock down once asset origins stabilize.
- **Server not deployed**: `render.yaml` + `Dockerfile` exist; provisioning is manual and not yet done.
- **Postgres cutover pending**: dev uses SQLite; `schema.postgresql.prisma` is kept in sync but not yet the live schema.
- **Dependency vulnerabilities**: `npm audit` still reports a few moderate/high vulns after `audit fix` — `--force` not applied to avoid breaking builds.
- **Bundle size**: admin routes are code-split, but initial bundle is still ~100 KB gzipped — room for more splitting, image optimization, and response caching.

## When making changes

- Run the relevant workspace's tests (`npm run test:run`) before declaring done; run Playwright when touching auth, submissions, leaderboards, or admin flows.
- Lint the client (`cd client && npm run lint`) after UI changes.
- If you change the Prisma schema, generate a migration (`db:migrate`) and update `seed.ts` if the shape of seed data changes. Keep `server/prisma/schema.prisma` and `server/prisma/schema.postgresql.prisma` in sync until one is removed.
- If you add public routes, register their Zod schemas with the OpenAPI registry in `server/src/openapi.ts`.
- If you log, use the pino `logger` — do not reintroduce `console.log` in production code paths.
- Don't rename the root package from `schaffer-shufflers` as part of unrelated work — it appears in lockfiles and would create noisy diffs; do it as its own change.
