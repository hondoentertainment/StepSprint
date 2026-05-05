# StepSprint Deployment Guide

For the **ordered launch-day runbook** (apply this top-to-bottom on cutover), see [LAUNCH.md](LAUNCH.md). For a deeper **production-readiness checklist** (secrets, cron, Sentry releases, legal, monitoring), see [PRODUCTION.md](PRODUCTION.md).

StepSprint runs as a single Vercel project (SPA + serverless API on the same origin):

| Component | Where | URL |
|-----------|-------|-----|
| React SPA (client) | Vercel static + PWA | `https://stepsprint.vercel.app` |
| Express API (server) | Vercel Function (`api/[...all].js`) | `https://stepsprint.vercel.app/api/*` |
| Postgres | Vercel Marketplace (Neon) | wired via `DATABASE_URL` + `DIRECT_URL` |
| Hourly reminders | **Vercel Cron** → `GET /api/cron/reminder-sweep` | `vercel.json` `crons` |

Same-origin means **no CORS** between the SPA and the API: `APP_ORIGIN` is just your real Vercel hostname (used for cookie binding), and `API_PUBLIC_ORIGIN` defaults to the same value. OAuth callbacks (Fitbit/Google/Garmin) and Apple Health Shortcuts hit the same Vercel hostname under `/api/integrations/...`.

### Wearables and step ingest (Fitness sync)

Participants connect devices from the SPA **Devices** page:

- **Apple Watch / Apple Health**: no cloud OAuth env vars — users mint an **`POST /api/integrations/tokens`** token and send steps with **`POST /api/integrations/apple-health`** (typical automation: **iOS Shortcuts** calling the API host with **`Authorization: Bearer ssp_*`** body includes `challengeId`).
- **Fitbit**, **Google Fit**, **Garmin Connect**: optional **OAuth** credentials on the API:
  `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and optionally `GARMIN_OAUTH_SCOPE`.
  Redirect URLs must align with **`API_PUBLIC_ORIGIN`** (see OAuth route callbacks under **`/api/integrations/...`**).
- **Bulk JSON import**: **`POST /api/integrations/csv`** (participant session or cookie auth) mirrors the spreadsheet-style import in **`server/src/routes/integrations.ts`**.

---

## Quick deploy (Vercel — one project)

The whole app deploys as one Vercel project: the SPA, the Express API as a Function (`api/[...all].js`), and the hourly reminder via Vercel Cron.

### 1 — Provision Postgres (one-time)

Use the **Vercel Marketplace** and add **Neon Postgres** to the project (Vercel dashboard → your project → **Storage** → **Create** → **Neon Postgres**). Vercel auto-injects environment variables; the only ones the app reads directly are:

| Var | Source | Notes |
|-----|--------|-------|
| `DATABASE_URL` | Marketplace (pooled) | Used at runtime by Prisma client (PgBouncer-safe). |
| `DIRECT_URL` | Marketplace (unpooled) | Used by `prisma migrate deploy` during build. Set it to the Marketplace `*_UNPOOLED` value (e.g. `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING`). |

If your Marketplace integration only sets a single URL, point both at it; migrations will still run.

### 2 — Set required environment variables

In Vercel dashboard → project → **Settings** → **Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | Min **32 chars** in production. Generate `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `RESEND_API_KEY` | **Yes** (public prod) | Resend API key. Without it (or `SMTP_HOST`), the function exits on boot unless `ALLOW_PRODUCTION_WITHOUT_EMAIL=true`. |
| `SMTP_FROM` | **Yes** (with Resend/SMTP) | Sender address, e.g. `StepSprint <noreply@yourdomain.com>`. |
| `ADMIN_PASSWORD` | **Recommended (first deploy)** | Initial password for `admin@stepsprint.local`. If unset on first deploy, a random one is logged once. The seed runs at build time (see **Step 3**), so the admin lands in the new database before the function serves requests. |
| `APP_ORIGIN` | **Yes** | Your real Vercel URL (e.g. `https://stepsprint.vercel.app`). Used for cookie + CORS even though the app is same-origin. |
| `NODE_ENV` | **Yes** | `production`. |
| `REMINDER_USE_EXTERNAL_CRON` | **Yes** | `true` — disables the in-process scheduler so only Vercel Cron triggers the sweep. (The scheduler is also auto-disabled when `VERCEL=1`, but setting this makes intent explicit and silences the startup warning.) |
| `CRON_SECRET` | **Yes** | Min 16 chars. Vercel Cron auto-populates `Authorization: Bearer <CRON_SECRET>` on every scheduled call to `/api/cron/reminder-sweep`. The legacy `REMINDER_CRON_SECRET` env name is also accepted server-side. |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Optional | Server + browser Sentry. |
| `VITE_POSTHOG_KEY` | Optional | PostHog (browser). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional | Web Push reminders. Generate with `npx web-push generate-vapid-keys`. |
| `FITBIT_*` / `GOOGLE_*` / `GARMIN_*` | Optional | OAuth integrations. Redirect URIs are `https://<your-vercel-host>/api/integrations/<provider>/callback`. |

> The SPA does **not** need `VITE_API_URL` anymore — same-origin means relative `/api/*` paths just work.

### 3 — Build pipeline (`vercel.json`)

`vercel.json` chains:

1. `installCommand` — `npm ci` at root + `server/` + `client/`.
2. `buildCommand` —
   1. `node scripts/switch-to-postgres-schema.mjs` (swap to `schema.postgresql.prisma` + `migrations_postgres/`).
   2. `cd server && npx prisma generate && npx prisma migrate deploy && npm run build` (compile server TS → `server/dist`; this is what `api/[...all].js` requires).
   3. `cd client && npm run build` (Vite + PWA service worker).
3. `functions` — `api/[...all].js` runs as a Node serverless function (mem 1024MB, 30s timeout).
4. `crons` — `GET /api/cron/reminder-sweep` every hour.
5. `rewrites` — non-`/api/*` paths fall back to `index.html` (SPA).
6. `headers` — CSP / X-Frame-Options / Referrer-Policy.

> **Admin seed** is part of the build only via `migrate deploy` + the in-app first-login flow. To run the production admin seed once-off, run `node server/dist/seed.js` from the Vercel CLI (`vercel env pull .env.local && node server/dist/seed.js`) or a one-off CI step.

### 4 — Deploy

Push to `master` (Vercel auto-deploy) or run from the repo root:

```bash
npx vercel deploy --prod --yes
```

### 5 — Smoke test

```bash
curl -sS "https://<your-vercel-host>/api/health"
# {"ok":true,"db":"up","service":"stepsprint-api",...}
```

Optional helper from the repo root:

```bash
API_BASE_URL=https://<your-vercel-host> npm run check:api
```

## Local development (Postgres parity)

Default development uses SQLite (`DATABASE_URL` with a `file:` URL). For Postgres parity, point `DATABASE_URL` at a Neon dev branch from the Vercel Marketplace, or at a local instance. From the repo root, **`docker-compose.yml`** can supply local Postgres (`docker compose up -d`); then run migrations from `server/` against **`server/prisma/schema.postgresql.prisma`** (production uses `migrations_postgres/` via `scripts/switch-to-postgres-schema.mjs` — mirror that workflow when validating Postgres locally).

---

## Post-deploy checklist

After the first successful deploy, complete these steps:

- [ ] **Change the admin password** — log in with the password from `ADMIN_PASSWORD` (or from the Vercel Function logs if auto-generated on first seed), then change it via the profile page.
- [ ] **Verify email delivery** — register a test account and confirm the verification email arrives.
- [ ] **Create a challenge** — log in as admin, create the first challenge, generate an invite code, and test the invite flow.
- [ ] **Confirm database backups** — Neon (Vercel Marketplace) keeps point-in-time recovery; review retention on the Storage tab and schedule a [backup restore drill](BACKUP_DRILL.md) before a major launch.
- [ ] **Health check monitoring** — point an external monitor at `GET https://<your-vercel-host>/api/health`. A `200` body includes `{ "ok": true, "db": "up" }`; `503` means the function cannot reach the database.
- [ ] **Cron is firing** — Vercel dashboard → project → **Cron** tab shows the last run for `/api/cron/reminder-sweep` (one execution per hour). Check Function logs if you don't see runs.
- [ ] **OpenAPI / Swagger** — `/api/docs` is **off** in production by default. Set `OPENAPI_DOCS_ENABLED=true` on the API only if you need the interactive spec in prod.

### Staging (recommended before a broad launch)

Use a Vercel **Preview** deployment with its own Neon dev branch (Vercel Marketplace can attach one per preview). Same-origin means CSRF, cookies, and email flows mirror production without origin config. Run `npm test`, `npm run build`, and `npm run test:e2e` against the preview URL.

| | Production (example) | Staging (Vercel Preview) |
|---|----------------------|---------------------------|
| Origin (SPA + API) | `https://stepsprint.vercel.app` (or custom) | Per-deploy preview URL (`https://*-<hash>.vercel.app`) |
| `APP_ORIGIN` | Production hostname | Preview hostname (or set `APP_ALLOW_VERCEL_PREVIEW_ORIGINS=true` on a non-prod env) |
| Database | Neon main branch | Per-preview Neon dev branch (Vercel Marketplace can attach automatically) |
| OAuth redirect URIs | Match production hostname | Add the staging hostname in each provider console |

---

## Optional integrations

### Sentry error tracking

In the Vercel dashboard → **Settings → Environment Variables** → set `SENTRY_DSN` for the Function and `VITE_SENTRY_DSN` for the browser. To symbolicate browser stacks, also set **`SENTRY_AUTH_TOKEN`**, **`SENTRY_ORG`**, and **`SENTRY_PROJECT`** for **production builds** (`@sentry/vite-plugin` uploads hidden source maps tagged with `VITE_SENTRY_RELEASE` — see `client/vite.config.ts`; Vercel auto-injects `VERCEL_GIT_COMMIT_SHA` for the release name when you don't set it).

### PostHog analytics

In the Vercel dashboard → set `VITE_POSTHOG_KEY` (and optionally `VITE_POSTHOG_HOST`). The production build shows a cookie banner on first visit: analytics loads only if the visitor accepts. Legal pages (`/privacy`, `/terms`) are linked from the banner and from the app footer; replace placeholder copy with your jurisdiction-specific text before a public launch.

### Web Push notifications

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. In the Vercel dashboard → **Settings → Environment Variables**, set:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (e.g. `mailto:admin@yourdomain.com`)

### Fitbit integration

1. Register an app at [dev.fitbit.com](https://dev.fitbit.com/apps/new).
2. Set the OAuth redirect URI to:
   ```
   https://<your-vercel-host>/api/integrations/fitbit/callback
   ```
3. In Vercel → set `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`.

### Google Fit integration

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) → enable the **Fitness API**.
2. Create OAuth 2.0 credentials. Set the redirect URI to:
   ```
   https://<your-vercel-host>/api/integrations/google-fit/callback
   ```
3. In Vercel → set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## Environment variables reference

All variables live in **Vercel → project → Settings → Environment Variables**.

### Required

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` (Vercel sets this automatically on prod deploys). |
| `JWT_SECRET` | Min 32 chars. Generate `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `DATABASE_URL` | Pooled Postgres connection string. Auto-aliased from `POSTGRES_PRISMA_URL` (Vercel Postgres / Neon Marketplace) at build and runtime. |
| `DIRECT_URL` | Direct (non-pooled) connection used by `prisma migrate deploy`. Auto-aliased from `POSTGRES_URL_NON_POOLING`. |
| `APP_ORIGIN` | Your production Vercel hostname (e.g. `https://stepsprint.vercel.app`). Used for cookie binding and (if you ever add a second hostname) CORS. |
| `RESEND_API_KEY` | Required for production unless `ALLOW_PRODUCTION_WITHOUT_EMAIL=true`. |
| `SMTP_FROM` | Verified sender address. Required when an email transport is set. |
| `REMINDER_USE_EXTERNAL_CRON` | `true` — explicit flag that the in-process scheduler is disabled (Vercel Cron is the only scheduler). |
| `CRON_SECRET` | Min 16 chars. Vercel Cron auto-attaches this as `Authorization: Bearer <CRON_SECRET>` to `/api/cron/reminder-sweep`. The legacy `REMINDER_CRON_SECRET` env name is also accepted. |

### Recommended

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD` | Initial seed password for `admin@stepsprint.local`. If unset on the very first deploy, a random one is logged once. |
| `SENTRY_DSN` | Server Sentry. |
| `VITE_SENTRY_DSN` | Browser Sentry. |
| `VITE_POSTHOG_KEY` | PostHog (loads only after the cookie banner is accepted in production). |
| `VITE_LEGAL_CONTENT_REVIEWED` | `true` once Privacy/Terms copy is finalized — hides the draft banner. |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | Upload hidden browser source maps at build time. |

### Optional

| Variable | Description |
|----------|-------------|
| `APP_ORIGIN_ALLOWLIST` | Comma-separated extra SPA origins for CORS (e.g. `https://www.example.com`). Usually unneeded — same-origin Vercel does not require this. |
| `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` | `true` on **staging only** to allow `https://*.vercel.app` previews to call the API with credentials. Never enable on prod. |
| `API_PUBLIC_ORIGIN` | Override the URL the server reports in OAuth callbacks and Apple Health Shortcuts. Defaults to `APP_ORIGIN`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push reminders. Generate with `npx web-push generate-vapid-keys`. |
| `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET` | Fitbit OAuth. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Fit OAuth. |
| `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_OAUTH_SCOPE` | Garmin OAuth. |
| `REMINDER_NOTIFICATION_HOUR_LOCAL` | Local hour per challenge TZ when reminders fire (`0`-`23`; default `17`). |
| `OPENAPI_DOCS_ENABLED` | `true` to expose `/api/docs` and `/api/openapi.json` in production (off by default). |
| `LOG_LEVEL` | pino level (`info` default). |
| `ALLOW_PRODUCTION_WITHOUT_EMAIL` | Escape hatch: allow `NODE_ENV=production` without Resend/SMTP. Email flows will silently no-op. |

### External cron callers (rare on Vercel)

If for some reason you don't use Vercel Cron, hit the same endpoint hourly from any scheduler:

```bash
curl -fsS "https://<your-vercel-host>/api/cron/reminder-sweep" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The repo's `scripts/curl-reminder-sweep.sh` does the same and reads `API_PUBLIC_ORIGIN` and `CRON_SECRET` (or legacy `REMINDER_CRON_SECRET`) from the environment.

---

## Local development

```bash
# Clone and install
git clone <repo>
cd StepSprint
npm install          # installs root + both workspaces

# Database setup — SQLite (default)
cd server
cp ../.env.example .env   # edit JWT_SECRET at minimum (+ API_PUBLIC_ORIGIN if testing OAuth locally without proxy)
npm run db:migrate
npm run db:seed

# Run both servers
cd ..
npm run dev          # server :3001, client :5173
```

### Postgres parity (recommended before risky migrations)

Matches production (`schema.postgresql.prisma` + `migrations_postgres/`). From the **repo root**:

1. Start local Postgres:

   ```bash
   docker compose up -d
   ```

2. Switch the Prisma layout to PostgreSQL files (cross-platform):

   ```bash
   npm run postgres:parity
   ```

3. In `server/.env` set:

   ```bash
   DATABASE_URL="postgresql://stepsprint:stepsprint@localhost:5432/stepsprint"
   ```

4. Apply migrations and seed:

   ```bash
   cd server
   npx prisma generate
   npx prisma migrate deploy
   npx prisma db seed
   ```

To go back to SQLite for daily dev, restore `server/prisma/schema.prisma` and `server/prisma/migrations/` from Git (`git checkout -- server/prisma/schema.prisma server/prisma/migrations` — or re-clone a clean tree).

---

## Post-deploy email smoke (recommended)

After `RESEND_API_KEY` and `SMTP_FROM` are set on the API:

1. Open the production SPA and **create a new account** with a mailbox you control.
2. Confirm the **verification email** arrives and the link works (`/verify-email`).
3. **Sign out**, then **sign in** with the same account.
4. Use **Forgot password**, confirm the **reset email** arrives and completes.
5. (Optional) Trigger **resend verification** from the login messaging if you test a second address.

Record success in your release notes or ops log.

### Default seed users (local SQLite)

- Admin: `admin@stepsprint.local`
- Participants: `user1@stepsprint.local` … `user12@stepsprint.local`

Password for all seeded users: `password123`. All have `emailVerified: true` so the verification gate does not block local development.

---

## Architecture notes

- **Dev DB**: SQLite via `@prisma/adapter-better-sqlite3` (auto-detected when `DATABASE_URL` starts with `file:`). The adapter is lazy-loaded so production Vercel bundles don't include the native `better-sqlite3` binding.
- **Prod DB**: PostgreSQL. `scripts/vercel-build.mjs` swaps the Postgres schema and migrations into place, then runs `prisma migrate deploy`. Safe on re-deploy — only pending migrations are applied. A failed migration fails the deploy.
- **API runtime**: A single Vercel Function (`api/[...all].js`) wraps the compiled Express app (`server/dist/app.js`). It cold-starts in ~1–2 s with the Prisma client and reuses the warm instance across requests (Fluid Compute).
- **Reminders**: Vercel Cron pings `GET /api/cron/reminder-sweep` hourly. The in-process scheduler is a no-op when `VERCEL=1`, so duplicate sweeps are impossible across cold-started function instances.
- **Email verification**: new self-registered users must verify their email before logging in. Admin-added participants and invite-accepted users are pre-verified (the invite itself is the trust signal).
- **JWT revocation**: each user has a `tokenVersion` counter embedded in their JWT. Logout, password change, and password reset all increment it, immediately invalidating all outstanding tokens on other devices.
- **Same-origin cookies**: SPA and API live on the same Vercel hostname. Session cookies and CSRF pairs ride a normal `SameSite=Lax`/`Secure` cookie. The cross-origin `SameSite=None` path is still implemented for the rare case you put the API behind a different hostname.
- **CSRF protection**: double-submit cookie pattern (production only). Bearer token requests (iOS Shortcuts / OAuth flows) bypass CSRF.
- **Rate limiting**: production-only for general/API limiters. Login endpoint is limited to 10 attempts / 15 min per IP.
- **CSP**: strict policy on all API routes (`script-src 'self'`); relaxed only for `/api/docs` and `/api/openapi.json` to accommodate Swagger UI assets from cdn.jsdelivr.net.

---

## Security checklist

- [x] `JWT_SECRET` ≥32 chars (enforced at boot in production)
- [x] HTTPS enforced (Vercel manages TLS)
- [x] Same-origin SPA + API — no CORS surface; optional `APP_ORIGIN_ALLOWLIST` + `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` for staging
- [x] CSRF protection (double-submit cookie, production)
- [x] Rate limiting — login: 10/15 min, auth: 30/15 min, API: 120/min
- [x] Helmet security headers (server) + Vercel platform headers (`vercel.json`)
- [x] CSP — no `unsafe-inline` for scripts on API or client
- [x] HTTP-only session cookies
- [x] Email verification required before first login
- [x] JWT revocation on logout / password change / password reset
- [x] Admin password from env var (or auto-generated random with warning)
- [x] Cursor-based pagination on admin submissions list
- [x] `prisma migrate deploy` (not `db push --accept-data-loss`) on every Vercel build
- [ ] Resend (or SMTP) configured (`RESEND_API_KEY` + `SMTP_FROM`) — required
- [ ] Sentry DSN — optional
- [ ] VAPID keys for Web Push — optional
