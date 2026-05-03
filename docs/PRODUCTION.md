# StepSprint production readiness

Companion to [DEPLOYMENT.md](DEPLOYMENT.md). Use this as an internal checklist before a broad launch or security review.

## 1. Platform and operations

- **Database**: Production must use **PostgreSQL** only (Render `stepsprint-db` or equivalent). Run a **backup restore drill** and document RTO/RPO.
- **Secrets**: `JWT_SECRET`, `REMINDER_CRON_SECRET`, OAuth secrets, Resend/SMTP, and VAPID keys belong in the host secret store—never in the repo. Rotate after any leak.
- **Multi-instance API**: Set `REMINDER_USE_EXTERNAL_CRON=true` and schedule an hourly `POST /api/cron/reminder-sweep` with `Authorization: Bearer <REMINDER_CRON_SECRET>` so reminder sweeps are not duplicated per replica.
- **Health**: Expose `GET /api/health`. Response includes `service: "stepsprint-api"`, `db: "up" | "down"`, and **`release`** when `SENTRY_RELEASE`, `RENDER_GIT_COMMIT`, `GITHUB_SHA`, or similar is set. Point an external monitor at this endpoint.
- **Release identifiers**: Set `SENTRY_RELEASE` explicitly (e.g. `stepsprint-api@abc1234`) when the platform does not inject a git SHA into the container. The API also auto-derives a short release from `RENDER_GIT_COMMIT` / `GITHUB_SHA` / `VERCEL_GIT_COMMIT_SHA` / `COMMIT_REF` when unset.

## 2. Client build and Sentry

- **Vercel / CI**: The client build sets `import.meta.env.VITE_SENTRY_RELEASE` from `VITE_SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA` (see `client/vite.config.ts`). Configure `VITE_SENTRY_DSN` in Vercel for browser errors.
- **Source maps**: Production uses **hidden** source maps (`build.sourcemap: "hidden"`). Upload symbols to Sentry in CI with `sentry-cli` when you want readable stack traces (optional follow-up).

## 3. Security

- **Origins**: After any domain change, update `APP_ORIGIN`, `API_PUBLIC_ORIGIN`, Vercel `connect-src`, and all OAuth redirect URIs together.
- **CSRF**: Production enforces double-submit cookies on mutating `/api/*` routes (except Bearer and documented exceptions). Verify in **staging** with the real split origins.
- **Rate limiting**: Production tier is enabled in `server/src/middleware/rateLimit.ts`; tune if you see abuse.
- **Logs**: HTTP logs **redact** `Authorization`, `Cookie`, and `x-csrf-token` headers (see `server/src/logger.ts`).

## 4. Observability

- **Server Sentry**: `SENTRY_DSN` + optional `SENTRY_RELEASE` / auto SHA (see above).
- **Request IDs**: The API sets `x-request-id` on responses. The SPA records the last id from API responses and attaches it to Sentry events as `lastRequestId` when reporting errors (`client/src/api.ts`, `client/src/requestContext.ts`).

## 5. Email

- **Resend**: `RESEND_API_KEY` and `SMTP_FROM` are required for verification and password reset in production (see [DEPLOYMENT.md](DEPLOYMENT.md)). Run an end-to-end registration + reset test after deploy.

## 6. Legal and product

- **Privacy / Terms**: Replace placeholder copy with counsel-reviewed text and real contact details. The app shows a **production notice** banner on `/privacy` and `/terms` until you remove or replace those strings in `client/src/i18n/*.json`.
- **Locale**: Default language uses `localStorage` (`stepsprint-locale`), then **browser** `navigator.language` for Spanish when no preference is stored, then English.

## 7. Quality gates

- **CI**: Unit tests, Postgres parity job, client lint/build, smoke health check, and **Playwright E2E** (desktop Chrome only) on `master` / PRs—see `.github/workflows/ci.yml`.
- **Staging**: Mirror split hosting (different SPA and API URLs) before large launches.

## 8. Dependency posture

- Run `npm audit` in **client** and **server** (root audit may not include workspaces). High findings in `vite-plugin-pwa` / `serialize-javascript` and moderate findings in Prisma dev tooling may require **tested** major upgrades—avoid blind `npm audit fix --force`.

## 9. Out of scope for default OSS deploy

Multi-tenancy, realtime leaderboards, native apps beyond PWA, and advanced churn forecasting are not required for a first production cut—track separately if the product roadmap expands.
