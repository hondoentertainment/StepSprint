# StepSprint production readiness

Companion to [DEPLOYMENT.md](DEPLOYMENT.md). Use this as an internal checklist before a broad launch or security review.

## 1. Platform and operations

- **Startup validation**: With `NODE_ENV=production`, the process exits on invalid combinations: SQLite `file:` `DATABASE_URL`, loopback `APP_ORIGIN` (`localhost` / `127.0.0.1` / `::1`), `JWT_SECRET` shorter than 32 characters, **missing email transport** (`RESEND_API_KEY` / `SMTP_HOST`) unless **`ALLOW_PRODUCTION_WITHOUT_EMAIL=true`**, or **missing `SMTP_FROM`** when a transport is configured. The Vitest harness sets `VITEST=true` so tests can keep SQLite and short secrets; **never set `VITEST` on a deployed server** (Render, Docker, etc.).
- **Database**: Production must use **PostgreSQL** only (Render `stepsprint-db` or equivalent). Run a **backup restore drill** (see [BACKUP_DRILL.md](BACKUP_DRILL.md)) and document RTO/RPO (example: RPO = daily backup retention window; RTO = time to restore from backup plus redeploy — replace with your measured values).
- **Secrets**: `JWT_SECRET`, `REMINDER_CRON_SECRET`, OAuth secrets, Resend/SMTP, and VAPID keys belong in the host secret store—never in the repo. Rotate after any leak.
- **Multi-instance API**: Set `REMINDER_USE_EXTERNAL_CRON=true` and schedule an hourly `POST /api/cron/reminder-sweep` with `Authorization: Bearer <REMINDER_CRON_SECRET>` so reminder sweeps are not duplicated per replica.
- **Health**: Expose `GET /api/health`. Response includes `service: "stepsprint-api"`, `db: "up" | "down"`, **`release`** when `SENTRY_RELEASE`, `RENDER_GIT_COMMIT`, `GITHUB_SHA`, or similar is set, and in **`NODE_ENV=production`** a **`transactionalEmail`** field: `"configured"` (Resend/SMTP) or `"allow_without_flag"` (`ALLOW_PRODUCTION_WITHOUT_EMAIL`). Point an external monitor at this endpoint.
- **Release identifiers**: Set `SENTRY_RELEASE` explicitly (e.g. `stepsprint-api@abc1234`) when the platform does not inject a git SHA into the container. The API also auto-derives a short release from `RENDER_GIT_COMMIT` / `GITHUB_SHA` / `VERCEL_GIT_COMMIT_SHA` / `COMMIT_REF` when unset.

## 2. Client build and Sentry

- **Vercel / CI**: The client build sets `import.meta.env.VITE_SENTRY_RELEASE` from `VITE_SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA` (see `client/vite.config.ts`). Configure `VITE_SENTRY_DSN` in Vercel for browser errors.
- **Source maps**: Production uses **hidden** source maps (`build.sourcemap: "hidden"`). When `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set at **build time** (for example on Vercel), `@sentry/vite-plugin` uploads maps to Sentry for that release. Omit those variables if you are not using Sentry or not ready to upload maps. Alternatively, use `sentry-cli` in a release job.

## 3. Security

- **Origins**: After any domain change, update `APP_ORIGIN`, `API_PUBLIC_ORIGIN`, optional comma-separated **`APP_ORIGIN_ALLOWLIST`** on the API for extra SPA origins (www vs apex, staging), Vercel `connect-src`, and all OAuth redirect URIs together. **Vercel previews**: either set `APP_ORIGIN`/`APP_ORIGIN_ALLOWLIST` to each preview URL, or use a **staging** API with `APP_ALLOW_VERCEL_PREVIEW_ORIGINS=true` (not recommended for production APIs).
- **CSRF**: Production enforces double-submit cookies on mutating `/api/*` routes (except Bearer and documented exceptions). Verify in **staging** with the real split origins.
- **Reverse proxy**: `trust proxy` is enabled in production so `X-Forwarded-*` is honored for client IP (rate limits, CSRF session binding). Do not set the `VITEST` environment variable on a real server—it is only for automated tests and would weaken startup validation.
- **Logs**: HTTP logs **redact** `Authorization`, `Cookie`, and `x-csrf-token` headers, plus common password and reset-token fields on `req.body` (see `server/src/logger.ts`).

## 4. Observability

- **Server Sentry**: `SENTRY_DSN` + optional `SENTRY_RELEASE` / auto SHA (see above).
- **Request IDs**: The API sets `x-request-id` on responses. The SPA records the last id from API responses and attaches it to Sentry events as `lastRequestId` when reporting errors (`client/src/api.ts`, `client/src/requestContext.ts`).

## 5. Email

- **Transactional mail**: Set `RESEND_API_KEY` or `SMTP_*` plus **`SMTP_FROM`** (required in production whenever those transports are set — no implicit default). In **`NODE_ENV=production`**, the API **refuses to start** without an email transport unless **`ALLOW_PRODUCTION_WITHOUT_EMAIL=true`** (use only for non-public or emergency bring-up; verification and password reset will not send mail). Run registration + forgot-password smoke tests after deploy.

## 6. Legal and product

- **Privacy / Terms**: Replace placeholder copy with counsel-reviewed text and real contact details. The app shows a **production notice** banner on `/privacy` and `/terms` until you set **`VITE_LEGAL_CONTENT_REVIEWED=true`** at client build time (or remove the banner strings in `client/src/i18n/*.json`).
- **Locale**: Default language uses `localStorage` (`stepsprint-locale`), then **browser** `navigator.language` for Spanish when no preference is stored, then English.

## 7. Quality gates

- **CI**: Unit tests, Postgres parity job, client lint/build, smoke health check, and **Playwright E2E** (desktop Chrome only) on `master` / PRs—see `.github/workflows/ci.yml`.
- **Staging**: Mirror split hosting (different SPA and API URLs) before large launches.

## 8. Dependency posture

- Run `npm audit` in **client** and **server** (root audit may not include workspaces). High findings in `vite-plugin-pwa` / `serialize-javascript` and moderate findings in Prisma dev tooling may require **tested** major upgrades—avoid blind `npm audit fix --force`.

## 9. Wearables / fitness integrations

**Production checklist (split hosting: Vercel SPA + Render API)**

- **`APP_ORIGIN`** (API): exact HTTPS origin of the SPA (no path, no trailing slash). Used for CORS and post-OAuth redirects.
- **`API_PUBLIC_ORIGIN`** (API): public HTTPS origin of **this** API. Must match what you register with Fitbit / Google / Garmin and what **`VITE_API_URL`** uses at **Vite build time** on Vercel.
- **`VITE_API_URL`** (Vercel / `client` build): set to **`API_PUBLIC_ORIGIN`** (example: `https://your-api.onrender.com`). Wrong value breaks the Devices curl helper, Shortcut URL text, and all `fetch` calls to the API. After changing the API hostname, redeploy **both** services.
- **Content-Security-Policy**: In `vercel.json`, `connect-src` must allow the same API host (and PostHog/Sentry hosts if used). Custom domains: update CSP when the API or analytics hosts change.

**Per integration**

- **Apple Watch / Apple Health**: No extra server secrets. Users create **`POST /api/integrations/tokens`** in the SPA, then Shortcuts **`POST`** to **`{API_PUBLIC_ORIGIN}/api/integrations/apple-health`** with `Authorization: Bearer ssp_…` and `Content-Type: application/json`. TLS on the API must be valid (Shortcuts reject bad certs).
- **Fitbit, Google Fit, Garmin**: Set client id/secret env vars on the API; register redirect URLs on **`API_PUBLIC_ORIGIN`** only (see `render.yaml` comments). Do not set only half of an id/secret pair — the server logs a warning in production if misconfigured.
- **Bulk days**: **`POST /api/integrations/csv`** is gated to enrolled participants; document internally if operators allow imports.

## 10. Out of scope for default OSS deploy

Multi-tenancy, realtime leaderboards, native apps beyond PWA, and advanced churn forecasting are not required for a first production cut—track separately if the product roadmap expands.
