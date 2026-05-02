# StepSprint Deployment Guide

StepSprint runs as two services:

| Service | Platform | URL |
|---------|----------|-----|
| React SPA (client) | Vercel | `https://step-sprint.vercel.app` |
| Express API (server) | Render | `https://stepsprint-api.onrender.com` |

URLs are pinned in `vercel.json`, `render.yaml`, and **`API_PUBLIC_ORIGIN`** — update **both** `APP_ORIGIN` and `API_PUBLIC_ORIGIN` if you put the SPA or API behind custom domains, and rewrite OAuth callbacks in Fitbit/Google consoles to match **`API_PUBLIC_ORIGIN`** (not the SPA hostname).

---

## Quick deploy (two steps)

### 1 — API on Render

1. Go to [render.com](https://render.com) → **New** → **Blueprint** → select this repo.
2. Render reads `render.yaml` and provisions:
   - `stepsprint-api` — Docker web service (Express API) — **Starter plan**
   - `stepsprint-db` — managed Postgres 16 — **Starter plan**
   - `JWT_SECRET` — auto-generated
   - `DATABASE_URL` — wired from `stepsprint-db`
   - `APP_ORIGIN` — pre-filled as `https://step-sprint.vercel.app`
   - `API_PUBLIC_ORIGIN` — public URL of **this Render web service**
   - `PORT=3001`, `NODE_ENV=production`

3. After the blueprint provisions, set the required env vars in **Render dashboard → stepsprint-api → Environment**:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `RESEND_API_KEY` | **Yes** | API key from [resend.com](https://resend.com) — needed for email verification and password reset |
   | `SMTP_FROM` | **Yes** | Sender address, e.g. `StepSprint <noreply@yourdomain.com>` |
   | `ADMIN_PASSWORD` | **Yes (first deploy)** | Initial admin password. If omitted a random one is printed in the deploy logs — change it immediately after first login. |

4. Trigger a deploy (or wait for auto-deploy on push to master).

The API will be live at `https://stepsprint-api.onrender.com`.

> **Note on plans**: `render.yaml` uses the `starter` plan ($7/mo each) to avoid cold starts and get automatic database backups. The free tier sleeps after 15 minutes of inactivity and has a 90-day database retention limit — not suitable for production.

### 2 — Client on Vercel

Vercel deployments run automatically on push to `master` via the GitHub integration.
`vercel.json` is pre-configured:
- Build: `cd client && npm run build`
- `VITE_API_URL=https://stepsprint-api.onrender.com` injected at build time
- SPA rewrites and security headers included

The client will be live at `https://step-sprint.vercel.app`.

---

## Post-deploy checklist

After the first successful deploy, complete these steps:

- [ ] **Change the admin password** — log in with the password from `ADMIN_PASSWORD` (or from Render logs if auto-generated), then change it via the profile page.
- [ ] **Verify email delivery** — register a test account and confirm the verification email arrives.
- [ ] **Create a challenge** — log in as admin, create the first challenge, generate an invite code, and test the invite flow.
- [ ] **Confirm database backups** — check the Render dashboard that daily backups are enabled for `stepsprint-db`.
- [ ] **Health check monitoring** — point an external monitor at `GET /api/health` on the API URL. A `200` body includes `{ "ok": true, "db": "up" }`; `503` means the app cannot reach the database.
- [ ] **OpenAPI / Swagger** — `/api/docs` is **off** in production by default. Set `OPENAPI_DOCS_ENABLED=true` on the API only if you need the interactive spec in prod.

### Staging (recommended before a broad launch)

Use a Vercel preview (or staging project) and a non-production API URL whose `APP_ORIGIN`, `API_PUBLIC_ORIGIN`, and client `VITE_API_URL` point at each other. Run `npm test`, `npm run build`, and `npm run test:e2e` against that stack so split-origin cookies, CSRF, and email flows match production.

---

## Optional integrations

### Sentry error tracking

In the Render dashboard → `stepsprint-api` → **Environment** → set `SENTRY_DSN`.
In the Vercel dashboard → **Settings → Environment Variables** → set `VITE_SENTRY_DSN`.

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

### Client (Vercel)

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `VITE_API_URL` | `vercel.json` | Yes | `https://stepsprint-api.onrender.com` |
| `VITE_SENTRY_DSN` | Vercel dashboard | No | Sentry DSN for browser errors |
| `VITE_POSTHOG_KEY` | Vercel dashboard | No | PostHog project key |
| `VITE_POSTHOG_HOST` | Vercel dashboard | No | PostHog host (defaults to `app.posthog.com`) |

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

# Optional Postgres parity (Docker) — repo root `docker-compose.yml`:
# docker compose up -d
# Then point DATABASE_URL at postgresql://stepsprint:stepsprint@localhost:5432/stepsprint
# and follow `Dockerfile`/Postgres schema instructions for production parity.

# Run both servers
cd ..
npm run dev          # server :3001, client :5173
```

Seed accounts (dev only, password `password123` for all):
- Admin: `admin@stepsprint.local`
- Participants: `user1@stepsprint.local` … `user12@stepsprint.local`

All seed users have `emailVerified: true` so the email verification gate doesn't block local development.

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

## Security checklist

- [x] `JWT_SECRET` auto-generated (Render)
- [x] HTTPS enforced (Render + Vercel handle TLS)
- [x] CORS restricted to `https://step-sprint.vercel.app`
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
