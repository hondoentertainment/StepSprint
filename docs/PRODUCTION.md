# StepSprint production readiness

Companion to [DEPLOYMENT.md](DEPLOYMENT.md). Use this as an internal checklist before a broad launch or security review. For the **ordered, do-it-in-order launch-day runbook**, see [LAUNCH.md](LAUNCH.md).

## 1. Platform and operations

- **Startup validation**: With `NODE_ENV=production`, the function exits on invalid combinations: SQLite `file:` `DATABASE_URL`, loopback `APP_ORIGIN` (`localhost` / `127.0.0.1` / `::1`), `JWT_SECRET` shorter than 32 characters, **missing email transport** (`RESEND_API_KEY` / `SMTP_HOST`) unless **`ALLOW_PRODUCTION_WITHOUT_EMAIL=true`**, or **missing `SMTP_FROM`** when a transport is configured. The Vitest harness sets `VITEST=true` so tests can keep SQLite and short secrets; **never set `VITEST` on Vercel** — it would weaken startup validation.
- **Database**: Production must use **PostgreSQL** (Vercel Marketplace Neon Postgres is the default). The Marketplace integration provides `POSTGRES_PRISMA_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (direct); `scripts/vercel-build.mjs` aliases them to `DATABASE_URL` / `DIRECT_URL` so Prisma works without extra wiring. `prisma migrate deploy` runs at build time using the direct URL to avoid PgBouncer prepared-statement issues. Run a **backup restore drill** (see [BACKUP_DRILL.md](BACKUP_DRILL.md)) and document RTO/RPO.
- **Secrets**: `JWT_SECRET`, `CRON_SECRET`, OAuth secrets, Resend/SMTP, and VAPID keys belong in Vercel → Settings → Environment Variables — never in the repo. Rotate after any leak.
- **Cron**: `vercel.json` schedules `GET /api/cron/reminder-sweep` hourly. Vercel Cron auto-injects `Authorization: Bearer <CRON_SECRET>` (the legacy `REMINDER_CRON_SECRET` env name is still accepted server-side). Always run with `REMINDER_USE_EXTERNAL_CRON=true` to silence the startup warning — the in-process scheduler is automatically a no-op when `VERCEL=1`.
- **Health**: Expose `GET /api/health`. Response includes `service: "stepsprint-api"`, `db: "up" | "down"`, **`release`** when `VERCEL_GIT_COMMIT_SHA` (auto-injected by Vercel), `SENTRY_RELEASE`, `GITHUB_SHA`, or similar is set, and in **`NODE_ENV=production`** a **`transactionalEmail`** field. Point an external monitor at this endpoint.
- **Release identifiers**: The API auto-derives a short release from `VERCEL_GIT_COMMIT_SHA` (Vercel build), `GITHUB_SHA`, or `COMMIT_REF`. Override with `SENTRY_RELEASE` if needed.

## 2. Client build and Sentry

- **Vercel / CI**: The client build sets `import.meta.env.VITE_SENTRY_RELEASE` from `VITE_SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA` (see `client/vite.config.ts`). Configure `VITE_SENTRY_DSN` in Vercel for browser errors.
- **Source maps**: Production uses **hidden** source maps (`build.sourcemap: "hidden"`). When `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set at **build time** (for example on Vercel), `@sentry/vite-plugin` uploads maps to Sentry for that release. Omit those variables if you are not using Sentry or not ready to upload maps. Alternatively, use `sentry-cli` in a release job.

## 3. Security

- **Origins**: After any domain change (custom domain, www-vs-apex), update `APP_ORIGIN`, optional comma-separated **`APP_ORIGIN_ALLOWLIST`** for any extra SPA origins, the `vercel.json` `connect-src` if you add an external API host, and all OAuth redirect URIs together. **Vercel previews**: either add each preview URL to `APP_ORIGIN_ALLOWLIST`, or set `APP_ALLOW_VERCEL_PREVIEW_ORIGINS=true` on a **staging** project (never on production).
- **CSRF**: Production enforces double-submit cookies on mutating `/api/*` routes (except Bearer and documented exceptions). Same-origin Vercel makes this transparent — no extra browser cookie work needed.
- **Reverse proxy**: `trust proxy` is enabled in production so `X-Forwarded-*` is honored for client IP (rate limits, CSRF session binding). Vercel's edge sets these correctly. Do not set the `VITEST` environment variable on Vercel — it is only for automated tests and would weaken startup validation.
- **Logs**: HTTP logs **redact** `Authorization`, `Cookie`, and `x-csrf-token` headers, plus common password and reset-token fields on `req.body` (see `server/src/logger.ts`).

## 4. Observability

- **Server Sentry**: `SENTRY_DSN` + optional `SENTRY_RELEASE` / auto SHA (see above). On Vercel, `api/index.js` calls `initSentry()` **before** loading the Express app so `@sentry/node` v8+ auto-instrumentation can attach to Express. The `/api/cron/reminder-sweep` handler additionally calls `Sentry.flush()` before returning so events captured inside the lambda are delivered before the function is frozen.
- **Request IDs**: The API sets `x-request-id` on responses. The SPA records the last id from API responses and attaches it to Sentry events as `lastRequestId` when reporting errors (`client/src/api.ts`, `client/src/requestContext.ts`).
- **Header redaction**: Sentry breadcrumbs filter `Authorization`, `Cookie`, `Set-Cookie`, and `x-csrf-token` (`server/src/sentry.ts`) on top of the existing pino-http redactions.

## 5. Email

- **Transactional mail**: Set `RESEND_API_KEY` or `SMTP_*` plus **`SMTP_FROM`** (required in production whenever those transports are set — no implicit default). In **`NODE_ENV=production`**, the API **refuses to start** without an email transport unless **`ALLOW_PRODUCTION_WITHOUT_EMAIL=true`** (use only for non-public or emergency bring-up; verification and password reset will not send mail).
- **Resend uses the HTTP API** (`POST https://api.resend.com/emails`), not the SMTP bridge. This avoids Vercel's outbound-SMTP throttling and surfaces structured error codes (e.g. `validation_error: From is not verified`) in the server log when sending fails.
- **Setup checklist**:
  1. Create an API key at <https://resend.com/api-keys> with **Sending access** to the relevant domain.
  2. Verify your sending domain at <https://resend.com/domains> and add the SPF + DKIM TXT records in your DNS host. DMARC is recommended but not required.
  3. Set `RESEND_API_KEY` and `SMTP_FROM` in Vercel → Settings → Environment Variables. `SMTP_FROM` must match the verified domain.
  4. Run registration + forgot-password smoke tests after deploy.

## 6. Product

- **Privacy / Terms**: The app does not ship Privacy or Terms pages — Privacy/Terms routes, the placeholder copy, and the draft banner have been removed. If your launch needs them, add counsel-reviewed pages and link them where appropriate (login footer, cookie banner, etc.).
- **Locale**: Default language uses `localStorage` (`stepsprint-locale`), then **browser** `navigator.language` for Spanish when no preference is stored, then English. The login and main-app footers expose a language switcher (`client/src/components/LanguageSwitcher.tsx`).

## 7. Quality gates

- **CI**: Unit tests, Postgres parity job, client lint/build, smoke health check, and **Playwright E2E** (desktop Chrome only) on `master` / PRs—see `.github/workflows/ci.yml`.
- **Staging**: Mirror split hosting (different SPA and API URLs) before large launches.

## 8. Dependency posture

- Run `npm audit` in **client** and **server** (root audit may not include workspaces). High findings in `vite-plugin-pwa` / `serialize-javascript` and moderate findings in Prisma dev tooling may require **tested** major upgrades—avoid blind `npm audit fix --force`.

## 9. Wearables / fitness integrations

**Production checklist (single Vercel project)**

- **`APP_ORIGIN`** (API): the same Vercel HTTPS origin (e.g. `https://stepsprint.vercel.app`). Same-origin means CORS is effectively a no-op, but the value is still used for cookie scope and post-OAuth redirects.
- **OAuth redirect URLs**: Register `https://<your-vercel-host>/api/integrations/<provider>/callback` for Fitbit / Google / Garmin. After changing the Vercel domain (custom domain, etc.), update each provider's console.
- **Content-Security-Policy**: `vercel.json` `connect-src` is `'self'` plus PostHog / Sentry. Same-origin = no extra hosts to add for the API.

**Per integration**

- **Apple Watch / Apple Health**: No extra server secrets. Users create **`POST /api/integrations/tokens`** in the SPA, then Shortcuts **`POST`** to `https://<your-vercel-host>/api/integrations/apple-health` with `Authorization: Bearer ssp_…` and `Content-Type: application/json`. TLS on `*.vercel.app` (and any custom domain) is automatic.
- **Fitbit, Google Fit, Garmin**: Set client id/secret env vars on the project. Don't set only half of an id/secret pair — the server logs a warning in production if misconfigured.
- **Bulk days**: **`POST /api/integrations/csv`** is gated to enrolled participants; document internally if operators allow imports.

## 10. Out of scope for default OSS deploy

Multi-tenancy, realtime leaderboards, native apps beyond PWA, and advanced churn forecasting are not required for a first production cut—track separately if the product roadmap expands.
