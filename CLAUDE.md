# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

StepSprint is a month-long step-challenge platform with teams, daily step submissions, weekly/monthly leaderboards, and an admin console. Monorepo with a React client, Express API, and Prisma/SQLite database.

Note: `package.json` still names the root workspace `schaffer-shufflers` — this is a legacy demo name. User-facing product name is **StepSprint**.

## Workspace layout

```
client/           Vite + React 19 + TypeScript frontend (React Router 7)
server/           Express 5 + TypeScript API (JWT auth, Zod validation)
  prisma/         Canonical Prisma schema (SQLite active;
                  PostgreSQL variant at schema.postgresql.prisma)
                  and migrations
  src/seed.ts     Seed entry point (wired via server/prisma.config.ts)
docs/             Screenshots and design notes
vercel.json       Frontend deploy config (API deployment is not yet wired)
```

## Commands

Run from repo root unless stated:

```bash
npm test                # client + server unit/integration (Vitest)
npm run test:coverage   # both with coverage
npm run test:e2e        # Playwright (desktop + Pixel 5 + iPhone 13)
```

Per-workspace:

```bash
cd server && npm run dev          # API on :3001 (tsx watch)
cd server && npm run db:migrate   # prisma migrate dev
cd server && npm run db:seed      # loads seed.ts (admin + sample users)
cd client && npm run dev          # Vite on :5173
cd client && npm run lint         # eslint
cd client && npm run build        # tsc -b && vite build
cd client && npm run test:e2e:ui  # Playwright UI mode
```

Seed users after `db:seed`:
- Admin: `admin@stepsprint.local`
- Participant (used by E2E): `user1@stepsprint.local`

## Architecture

### Server (`server/src`)
- `app.ts` / `index.ts` — Express app wiring, middleware, route mounting
- `routes/` — modular routers: `auth`, `admin`, `challenges`, `submissions`, `leaderboards`, `summary`, `analytics`, `invites`, `notifications`, `integrations`. Test files live beside their routes (`*.test.ts`) and use Supertest.
- `middleware/auth.ts` — JWT verification + role gates (`ADMIN` / `PARTICIPANT`)
- `middleware/rateLimit.ts` — rate limit (currently scoped to auth routes in prod)
- `services/` — email (Nodemailer), supporting helpers
- `utils/` — dates (Luxon, timezone-aware), password hashing (bcryptjs), reset tokens
- `prisma.ts` — Prisma client singleton using `@prisma/adapter-better-sqlite3`
- Input validation: Zod schemas on every mutating route
- Errors: custom `ApiError` class; routes throw, a central handler converts to JSON

### Client (`client/src`)
- `main.tsx` / `App.tsx` — router + providers
- `api.ts` — fetch wrapper, `ApiError`, auth token handling
- `components/` — page-level (`Home`, `Admin`, `Login`, `WeeklyLeaderboard`, `Submit`, `TeamStandings`, `InvitePage`, `ForgotPassword`, `ResetPassword`) and UI (`Layout`, `ConfirmDialog`, `WeekPicker`)
- `contexts/` — `WeekContext` for the selected calendar week
- `hooks/` — `useAuth`, `useChallenges`, etc.
- Styling is CSS-in-JS + `App.css` / `index.css`; no UI framework

### Data model (Prisma)
`User` (role), `Challenge` (month-scoped, timezone), `Team`, `TeamMember`, `StepSubmission` (unique on `userId+challengeId+date`), `PasswordResetToken`, `AuditLog`, `NotificationPreference`.

Team assignment supports random and snake-draft strategies at challenge creation.

## Conventions

- **TypeScript strict** in both workspaces — don't loosen it.
- **Zod first**: validate every request body/params; derive types from schemas where practical.
- **Timezone-aware dates**: use Luxon and the helpers in `server/src/utils` — never `new Date()` for challenge-day arithmetic.
- **Tests colocate**: server tests sit beside routes as `*.test.ts`; client unit tests as `*.test.tsx`; Playwright specs live under `client/` (see its config).
- **Audit admin writes**: admin mutations should append to `AuditLog`.
- **Prisma transactions** for multi-row writes (team allocation, submission edits).
- **Error handling**: throw `ApiError` on the server; catch `ApiError` in the client `api.ts` layer and surface typed messages.
- **No emojis** in code or UI unless the user asks.

## Known gaps / gotchas

- The active Prisma provider is SQLite via `better-sqlite3`; `.env.example` is aligned with SQLite. A `server/prisma/schema.postgresql.prisma` variant exists for a future Postgres cutover but isn't wired in. Confirm which provider is in use before touching migrations.
- Nodemailer is wired but no real SMTP provider is configured — password reset emails will no-op without one.
- Health-sync integrations (Apple Health / Google Fit / Fitbit) are not implemented — `routes/integrations.ts` is scaffolding.
- `npm audit` on the client reports 4 high-severity advisories after `npm audit fix` (all in the `vite-plugin-pwa > workbox-build > @rollup/plugin-terser > serialize-javascript` chain); resolving them requires a breaking downgrade and is deferred.
- Sentry and PostHog are wired on both client and server, but DSNs/keys are no-ops until the corresponding env vars (`VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `SENTRY_DSN`) are set in production.
- Route-based code splitting is applied to `Admin`, `WeeklyLeaderboard`, and `TeamStandings`; `Home`, `Login`, and `Submit` stay eager (critical path).
- No server deploy target is configured yet — a `Dockerfile` and `render.yaml` are tracked separately under `docs/DEPLOYMENT.md` (see "Server deploy").

## When making changes

- Run the relevant workspace's tests (`npm run test:run`) before declaring done; run Playwright when touching auth, submissions, leaderboards, or admin flows.
- Lint the client (`cd client && npm run lint`) after UI changes.
- If you change the Prisma schema, generate a migration (`db:migrate`) and update `seed.ts` if the shape of seed data changes.
- Keep both `server/prisma/schema.prisma` and `server/prisma/schema.postgresql.prisma` in sync if you modify models, until one is removed.
- Don't rename the root package from `schaffer-shufflers` as part of unrelated work — it appears in lockfiles and would create noisy diffs; do it as its own change.
