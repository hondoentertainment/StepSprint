# StepSprint Deployment Guide

StepSprint runs as two services:

| Service | Platform | URL |
|---------|----------|-----|
| React SPA (client) | Vercel | `https://step-sprint.vercel.app` |
| Express API (server) | Render | `https://stepsprint-api.onrender.com` |

Both URLs are already wired in `vercel.json` and `render.yaml` — no manual URL configuration is needed.

---

## Quick deploy (two clicks)

### 1 — API on Render

1. Go to [render.com](https://render.com) → **New** → **Blueprint** → select this repo.
2. Render reads `render.yaml` and provisions:
   - `stepsprint-api` — Docker web service (Express API)
   - `stepsprint-db` — managed Postgres 16 (free tier)
   - `JWT_SECRET` — auto-generated
   - `DATABASE_URL` — wired from `stepsprint-db`
   - `APP_ORIGIN` — pre-filled as `https://step-sprint.vercel.app`
   - `PORT=3001`, `NODE_ENV=production`

That's it. The API will be live at `https://stepsprint-api.onrender.com`.

### 2 — Client on Vercel

Vercel deployments run automatically on push to `master` via the GitHub integration.
`vercel.json` is pre-configured:
- Build: `cd client && npm run build`
- `VITE_API_URL=https://stepsprint-api.onrender.com` injected at build time
- SPA rewrites and security headers included

The client will be live at `https://step-sprint.vercel.app`.

---

## Remaining manual steps

Only two steps require human action in external consoles:

### Optional: Sentry error tracking

In the Render dashboard → `stepsprint-api` → **Environment** → set `SENTRY_DSN`.

### Optional: Fitbit integration

1. Register an app at [dev.fitbit.com](https://dev.fitbit.com/apps/new).
2. Set the OAuth redirect URI to:
   ```
   https://stepsprint-api.onrender.com/api/integrations/fitbit/callback
   ```
3. In Render dashboard → `stepsprint-api` → **Environment**, set:
   - `FITBIT_CLIENT_ID`
   - `FITBIT_CLIENT_SECRET`

### Optional: Google Fit integration

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) → enable the **Fitness API**.
2. Create OAuth 2.0 credentials. Set the redirect URI to:
   ```
   https://stepsprint-api.onrender.com/api/integrations/google-fit/callback
   ```
3. In Render dashboard → `stepsprint-api` → **Environment**, set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

The server starts and runs without any of the above OAuth vars — the integration endpoints return 503 until the credentials are set.

---

## Environment variables reference

### Server (Render)

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_ENV` | `render.yaml` | `production` |
| `PORT` | `render.yaml` | `3001` |
| `DATABASE_URL` | Render (auto) | PostgreSQL connection string from `stepsprint-db` |
| `JWT_SECRET` | Render (auto) | Random 64-char secret |
| `APP_ORIGIN` | `render.yaml` | `https://step-sprint.vercel.app` |
| `SENTRY_DSN` | Manual (optional) | Sentry project DSN |
| `FITBIT_CLIENT_ID` | Manual (optional) | Fitbit OAuth app ID |
| `FITBIT_CLIENT_SECRET` | Manual (optional) | Fitbit OAuth app secret |
| `GOOGLE_CLIENT_ID` | Manual (optional) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Manual (optional) | Google OAuth client secret |

### Client (Vercel)

| Variable | Source | Description |
|----------|--------|-------------|
| `VITE_API_URL` | `vercel.json` | `https://stepsprint-api.onrender.com` |
| `VITE_SENTRY_DSN` | Vercel dashboard (optional) | Sentry DSN for browser error reporting |
| `VITE_POSTHOG_KEY` | Vercel dashboard (optional) | PostHog project key for analytics |
| `VITE_POSTHOG_HOST` | Vercel dashboard (optional) | PostHog host (defaults to `app.posthog.com`) |

---

## Local development

```bash
# Clone and install
git clone <repo>
cd StepSprint
npm install          # installs root + both workspaces

# Database setup (SQLite)
cd server
cp ../.env.example .env   # edit JWT_SECRET and APP_ORIGIN
npm run db:migrate
npm run db:seed

# Run both servers
npm run dev          # from repo root (server :3001, client :5173)
```

Seed accounts (password `password123` for all):
- Admin: `admin@stepsprint.local`
- Participant: `user1@stepsprint.local`

---

## Architecture notes

- **Dev DB**: SQLite via `@prisma/adapter-better-sqlite3` (auto-detected when `DATABASE_URL` starts with `file:`)
- **Prod DB**: PostgreSQL via bare `PrismaClient()` (Render managed Postgres)
- The Docker build copies `schema.postgresql.prisma` over `schema.prisma` and runs `prisma db push` on startup
- CSRF protection is enabled in production (double-submit cookie pattern); Bearer token requests bypass it
- Rate limiting is production-only (auth, API, and general tiers)
- Content Security Policy is pinned in both `vercel.json` (client) and helmet (server)

---

## Security checklist

- [x] `JWT_SECRET` auto-generated (Render)
- [x] HTTPS enforced (Render + Vercel handle TLS)
- [x] CORS restricted to `https://step-sprint.vercel.app`
- [x] CSRF protection (double-submit cookie, production)
- [x] Rate limiting (production)
- [x] Helmet security headers (server)
- [x] CSP headers (client via `vercel.json`, server via helmet)
- [x] HTTP-only cookies
- [ ] SMTP for password reset emails (optional — configure Nodemailer env vars)
- [ ] Sentry DSN (optional)
