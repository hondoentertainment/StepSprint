# StepSprint Deployment Guide

For a **production-readiness checklist** (secrets, cron, Sentry releases, legal, monitoring), see [PRODUCTION.md](PRODUCTION.md).

StepSprint runs as two services:

| Service | Platform | URL |
|---------|----------|-----|
| React SPA (client) | Vercel | `https://step-sprint.vercel.app` |
| Express API (server) | Render | `https://stepsprint-api.onrender.com` |

URLs are pinned in `vercel.json`, `render.yaml`, and **`API_PUBLIC_ORIGIN`** — update **both** `APP_ORIGIN` and `API_PUBLIC_ORIGIN` if you put the SPA or API behind custom domains, and rewrite OAuth callbacks in Fitbit/Google consoles to match **`API_PUBLIC_ORIGIN`** (not the SPA hostname).

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

## Quick deploy (two steps)

### 1 — API on Render

The Blueprint file is [`render.yaml`](../render.yaml) at the **repository root**. **`dockerfilePath` is relative to that root** — it must be `./server/Dockerfile` (not `./Dockerfile`), with **`dockerContext: ./server`**, so Render builds the image defined under `server/`. An incorrect path caused failed or empty builds and a live site that never serves the API.

1. Go to [render.com](https://render.com) → **New** → **Blueprint** → select this repo (branch `master`).
2. Render reads `render.yaml` and provisions:
   - `stepsprint-api` — Docker web service (Express API) — **Starter plan**
   - `stepsprint-db` — managed Postgres 16 — **Starter plan**
   - `JWT_SECRET` — auto-generated
   - `DATABASE_URL` — wired from `stepsprint-db`
   - `APP_ORIGIN` — pre-filled as `https://step-sprint.vercel.app`
   - `API_PUBLIC_ORIGIN` — public URL of **this Render web service**
   - `PORT=3001`, `NODE_ENV=production`

   The Docker image starts the API with **`prisma migrate deploy`**, then **`node dist/seed.js`** (production seeds only the admin user; safe to run on every deploy), then **`node dist/index.js`**. You do not need a separate manual seed on Render for that admin account.

3. After the blueprint provisions, set the required env vars in **Render dashboard → stepsprint-api → Environment**:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `RESEND_API_KEY` | **Yes** (public prod) | API key from [resend.com](https://resend.com) — needed for email verification and password reset. Without it, the API **exits on boot** unless you set **`ALLOW_PRODUCTION_WITHOUT_EMAIL=true`** (private/temporary use only). |
   | `SMTP_FROM` | **Yes** (with Resend/SMTP) | Sender address, e.g. `StepSprint <noreply@yourdomain.com>` |
   | `ADMIN_PASSWORD` | **Recommended (first deploy)** | Initial admin password for `admin@stepsprint.local`. If omitted on the **first** deploy, a random password is logged once — save it and change it after login. If the admin already exists, omitting this on later deploys **does not** rotate the password. |

4. Trigger a deploy (or wait for auto-deploy on push to master).

The API will be live at `https://stepsprint-api.onrender.com` **only after** Render shows the service running (not “Blueprint pending” or suspended).

#### Verify the API is reachable

From your machine (replace the URL if you use a custom Render hostname):

```bash
curl -sS "https://stepsprint-api.onrender.com/api/health"
```

You should see JSON like `{ "ok": true, "db": "up", ... }`. If you get **404** with no JSON, Render is not routing to a web service (`x-render-routing: no-server` in response headers): create/start the **`stepsprint-api`** service from this repo’s blueprint or Docker image.

**Hostname must match the frontend:** In Vercel, `VITE_API_URL` (see [`vercel.json`](../vercel.json) `build.env`) must be the **exact** public API URL from Render (**Dashboard → your web service → URL**), including `https` and no trailing slash. If Render gives you a different subdomain (e.g. `stepsprint-api-xxxx.onrender.com` because the short name was taken), set **`API_PUBLIC_ORIGIN`** on the service to that URL, update **`vercel.json`** `VITE_API_URL` and the **CSP** `connect-src` host, push, and redeploy the client.

Optional script from the repo root (uses Node’s built-in `fetch`):

```bash
npm run check:api
# or: API_BASE_URL=https://your-api.example.com npm run check:api
```

**Sign-in / register fail from the SPA** usually means: (1) API URL wrong or not deployed, (2) **`APP_ORIGIN`** on Render does not **exactly** match the Vercel URL you open (scheme + host, no trailing slash), or (3) you need **`APP_ORIGIN_ALLOWLIST`** for an extra domain (e.g. `https://www.`). For Vercel **preview** builds only, a dedicated API can set **`APP_ALLOW_VERCEL_PREVIEW_ORIGINS=true`** (staging — not for production).

> **Note on plans**: `render.yaml` uses the `starter` plan ($7/mo each) to avoid cold starts and get automatic database backups. The free tier sleeps after 15 minutes of inactivity and has a 90-day database retention limit — not suitable for production.

### 2 — Client on Vercel

Vercel deployments run automatically on push to `master` via the GitHub integration.
`vercel.json` is pre-configured:
- Build: `cd client && npm run build`
- `VITE_API_URL=https://stepsprint-api.onrender.com` injected at build time
- SPA rewrites and security headers included
- Vercel respects the root `package.json` **`engines.node`** (`20.x`), aligning deploy builds with the client workspace `engines` constraint.
- Use **`.nvmrc`** at the repo root with nvm or fnm to match that Node version locally.

The client will be live at `https://step-sprint.vercel.app`.

## Local development (Postgres parity)

Default development uses SQLite (`DATABASE_URL` with a `file:` URL). For Postgres parity, point `DATABASE_URL` at managed Postgres (for example Render `stepsprint-db` from the blueprint) or at a local instance. From the repo root, **`docker-compose.yml`** can supply local Postgres (`docker compose up -d`); then run migrations from `server/` against **`server/prisma/schema.postgresql.prisma`** (production uses `migrations_postgres/` via the Docker image—mirror that workflow when validating Postgres locally).

---

## Post-deploy checklist

After the first successful deploy, complete these steps:

- [ ] **Change the admin password** — log in with the password from `ADMIN_PASSWORD` (or from Render logs if auto-generated), then change it via the profile page.
- [ ] **Verify email delivery** — register a test account and confirm the verification email arrives.
- [ ] **Create a challenge** — log in as admin, create the first challenge, generate an invite code, and test the invite flow.
- [ ] **Confirm database backups** — check the Render dashboard that daily backups are enabled for `stepsprint-db`, and schedule a [backup restore drill](BACKUP_DRILL.md) before a major launch.
- [ ] **Health check monitoring** — point an external monitor at `GET /api/health` on the API URL. A `200` body includes `{ "ok": true, "db": "up" }`; `503` means the app cannot reach the database.
- [ ] **OpenAPI / Swagger** — `/api/docs` is **off** in production by default. Set `OPENAPI_DOCS_ENABLED=true` on the API only if you need the interactive spec in prod.

### Staging (recommended before a broad launch)

Use a Vercel preview (or staging project) and a non-production API URL whose `APP_ORIGIN`, `API_PUBLIC_ORIGIN`, and client `VITE_API_URL` point at each other. Run `npm test`, `npm run build`, and `npm run test:e2e` against that stack so split-origin cookies, CSRF, and email flows match production.

| | Production (example) | Staging (you define) |
|---|----------------------|----------------------|
| SPA origin | `https://stepsprint.vercel.app` (or custom) | Preview URL or `staging.example.com` |
| API public URL | Render service URL | Separate Render service or preview API |
| `APP_ORIGIN` (API env) | SPA origin above | Staging SPA origin |
| `API_PUBLIC_ORIGIN` (API env) | API public URL | Staging API URL |
| `VITE_API_URL` (client build) | Same as production API | Staging API URL |
| OAuth redirect URIs | Match `API_PUBLIC_ORIGIN` | Match staging API URL |

---

## Optional integrations

### Sentry error tracking

In the Render dashboard → `stepsprint-api` → **Environment** → set `SENTRY_DSN`.
In the Vercel dashboard → **Settings → Environment Variables** → set `VITE_SENTRY_DSN`.
To symbolicate browser stacks, set **`SENTRY_AUTH_TOKEN`**, **`SENTRY_ORG`**, and **`SENTRY_PROJECT`** on Vercel for **production builds** (same release as `VITE_SENTRY_RELEASE` / git SHA — see `client/vite.config.ts`).

### PostHog analytics

In the Vercel dashboard → set `VITE_POSTHOG_KEY` (and optionally `VITE_POSTHOG_HOST`). The production build shows a cookie banner on first visit: analytics loads only if the visitor accepts. Legal pages (`/privacy`, `/terms`) are linked from the banner and from the app footer; replace placeholder copy with your jurisdiction-specific text before a public launch.

### Web Push notifications

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. In Render dashboard → `stepsprint-api` → **Environment**, set:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (e.g. `mailto:admin@yourdomain.com`)

### Fitbit integration

1. Register an app at [dev.fitbit.com](https://dev.fitbit.com/apps/new).
2. Set the OAuth redirect URI to:
   ```
   https://stepsprint-api.onrender.com/api/integrations/fitbit/callback
   ```
3. In Render dashboard → set `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`.

### Google Fit integration

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) → enable the **Fitness API**.
2. Create OAuth 2.0 credentials. Set the redirect URI to:
   ```
   https://stepsprint-api.onrender.com/api/integrations/google-fit/callback
   ```
3. In Render dashboard → set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## Environment variables reference

### Server (Render)

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `NODE_ENV` | `render.yaml` | Yes | `production` |
| `PORT` | `render.yaml` | Yes | `3001` |
| `DATABASE_URL` | Render (auto) | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Render (auto) | Yes | Random 64-char secret |
| `APP_ORIGIN` | `render.yaml` | Yes | Vercel SPA origin (default `https://step-sprint.vercel.app`) — used for **CORS** and **browser redirects after OAuth**. |
| `APP_ORIGIN_ALLOWLIST` | Manual | No | Comma-separated extra SPA origins (same rules as `APP_ORIGIN`) for **CORS** when you use a second hostname (e.g. `https://www.example.com`). |
| `APP_ALLOW_VERCEL_PREVIEW_ORIGINS` | Manual | No | Set to `true` only on a **non-production** API to allow **Vercel preview** URLs (`https://*.vercel.app`). Do not enable on your primary production API. |
| `API_PUBLIC_ORIGIN` | `render.yaml` | Yes (split hosting) | Public origin where **this** API is hosted (Render URL). OAuth `redirect_uri` must pin here (`https://stepsprint-api.onrender.com`). Omit only for same-origin / local Vite-proxy setups — then it mirrors `APP_ORIGIN`. |
| `RESEND_API_KEY` | Manual | **Yes** | Resend API key for transactional email |
| `SMTP_FROM` | Manual | **Yes** | Email sender address |
| `ADMIN_PASSWORD` | Manual | First deploy | Seed admin password |
| `SENTRY_DSN` | Manual | No | Sentry DSN |
| `VAPID_PUBLIC_KEY` | Manual | No | Web Push public key |
| `VAPID_PRIVATE_KEY` | Manual | No | Web Push private key |
| `VAPID_SUBJECT` | Manual | No | Web Push contact URI |
| `FITBIT_CLIENT_ID` | Manual | No | Fitbit OAuth app ID |
| `FITBIT_CLIENT_SECRET` | Manual | No | Fitbit OAuth app secret |
| `GOOGLE_CLIENT_ID` | Manual | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Manual | No | Google OAuth client secret |
| `REMINDER_NOTIFICATION_HOUR_LOCAL` | Manual | No | Local hour per challenge TZ when opt-in reminders are evaluated (`0`-`23`; default `17`). Server runs checks hourly; see `scheduler` service |
| `REMINDER_USE_EXTERNAL_CRON` | Manual | No | Set to `true` to **disable** the in-process hourly reminder loop (use when running multiple API instances so only one sweep runs). |
| `REMINDER_CRON_SECRET` | Manual | With external cron | Min 16 characters. Required for `POST /api/cron/reminder-sweep` with header `Authorization: Bearer <secret>`. |
| `OPENAPI_DOCS_ENABLED` | Manual | No | Set to `true` to expose `/api/docs` and `/api/openapi.json` in production. Omit or `false` to keep them disabled (default when `NODE_ENV=production`). |

Schedule the HTTP call from your host (for example Render **Cron Jobs**, GitHub Actions `schedule`, or Uptime Robot) at least once per hour. The sweep still only notifies users when their challenge timezone matches `REMINDER_NOTIFICATION_HOUR_LOCAL` and they are due for a reminder, so hourly pings are correct.

Example (replace URL and secret):

```bash
curl -fsS -X POST "https://stepsprint-api.onrender.com/api/cron/reminder-sweep" \
  -H "Authorization: Bearer $REMINDER_CRON_SECRET"
```

The repo includes **`scripts/curl-reminder-sweep.sh`**, which reads **`API_PUBLIC_ORIGIN`** and **`REMINDER_CRON_SECRET`** from the environment and performs the same request (useful in cron wrappers).

### Client (Vercel)

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `VITE_API_URL` | `vercel.json` | Yes | `https://stepsprint-api.onrender.com` |
| `VITE_SENTRY_DSN` | Vercel dashboard | No | Sentry DSN for browser errors |
| `SENTRY_AUTH_TOKEN` | Vercel dashboard | No | Upload **hidden** source maps at build (with `SENTRY_ORG` + `SENTRY_PROJECT`) |
| `SENTRY_ORG` | Vercel dashboard | No | Sentry org slug for upload |
| `SENTRY_PROJECT` | Vercel dashboard | No | Sentry project slug for browser / `stepsprint-client` |
| `VITE_POSTHOG_KEY` | Vercel dashboard | No | PostHog project key |
| `VITE_POSTHOG_HOST` | Vercel dashboard | No | PostHog host (defaults to `app.posthog.com`) |
| `VITE_LEGAL_CONTENT_REVIEWED` | Vercel dashboard | No | Set to `true` after Privacy/Terms copy is reviewed to hide the draft banner on those pages |

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

- **Dev DB**: SQLite via `@prisma/adapter-better-sqlite3` (auto-detected when `DATABASE_URL` starts with `file:`)
- **Prod DB**: PostgreSQL. The Dockerfile copies `schema.postgresql.prisma` over `schema.prisma` and replaces `migrations/` with `migrations_postgres/` before running `prisma migrate deploy`. Safe on re-deploy — only pending migrations are applied.
- **Email verification**: new self-registered users must verify their email before logging in. Admin-added participants and invite-accepted users are pre-verified (the invite itself is the trust signal).
- **JWT revocation**: each user has a `tokenVersion` counter embedded in their JWT. Logout, password change, and password reset all increment it, immediately invalidating all outstanding tokens on other devices.
- **HTTPS split hosting**: SPA and API live on **different origins**. Production session cookies and CSRF pairing use **`SameSite=None`** + **`Secure`** so authenticated `credentials: include` fetch calls succeed from `APP_ORIGIN` to `API_PUBLIC_ORIGIN`.
- **CSRF protection**: double-submit cookie pattern (production only). Bearer token requests (iOS Shortcuts / OAuth flows) bypass CSRF.
- **Rate limiting**: production-only for general/API limiters. Login endpoint is limited to 10 attempts / 15 min per IP.
- **CSP**: strict policy on all API routes (`script-src 'self'`); relaxed only for `/api/docs` and `/api/openapi.json` to accommodate Swagger UI assets from cdn.jsdelivr.net.

---

## PostgreSQL production cutover checklist

Use this when moving the live API from SQLite (never in prod) or recovering from a misconfigured DB to the managed Postgres defined in `render.yaml`.

1. **Provision or verify `stepsprint-db`** on Render (or your host): note connection limit, region, and that automated backups are on.
2. **Set `DATABASE_URL`** on the web service to the Postgres URL (the Docker entrypoint runs `prisma migrate deploy` against `migrations_postgres/`).
3. **Run a single-instance deploy first** so migrations finish without two processes racing; confirm logs for `migrate deploy` success.
4. **Smoke test after cutover**: `GET /api/health` (`db: up`), sign-in, create or open a challenge, one step submission, admin analytics (including cohort).
5. **Retain a snapshot** (Render backup or manual `pg_dump`) before major structural migrations or data fixes.
6. **Connection hygiene**: if you scale to multiple web instances, ensure your Prisma/database pool settings match Postgres `max_connections`; avoid sharing one tiny instance across many workers without a pooler.
7. **Rollback plan**: restore from the latest backup to a new DB, point `DATABASE_URL` at it, redeploy — document who can trigger this on your team.

Local parity: `docker compose up -d` from the repo root and `DATABASE_URL=postgresql://…` (see comments in **Local development** above) exercise the same schema as production.

---

## Security checklist

- [x] `JWT_SECRET` auto-generated (Render)
- [x] HTTPS enforced (Render + Vercel handle TLS)
- [x] CORS restricted to `APP_ORIGIN` + optional **`APP_ORIGIN_ALLOWLIST`** / preview flag (see [PRODUCTION.md](PRODUCTION.md))
- [x] CSRF protection (double-submit cookie, production)
- [x] Rate limiting — login: 10/15 min, auth: 30/15 min, API: 120/min
- [x] Helmet security headers (server)
- [x] CSP — no `unsafe-inline` for scripts on API or client
- [x] HTTP-only session cookies
- [x] Email verification required before first login
- [x] JWT revocation on logout / password change / password reset
- [x] Admin password from env var (or auto-generated random with warning)
- [x] Cursor-based pagination on admin submissions list
- [x] `prisma migrate deploy` (not `db push --accept-data-loss`) on container start
- [ ] SMTP / Resend configured (`RESEND_API_KEY` + `SMTP_FROM`) — required
- [ ] Sentry DSN — optional
- [ ] VAPID keys for Web Push — optional
