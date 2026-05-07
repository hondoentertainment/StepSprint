# StepSprint launch runbook

A single ordered checklist for taking StepSprint from a green CI to a public production deploy on **Vercel** (SPA + Function + Postgres on the same project). Reference docs: [DEPLOYMENT.md](DEPLOYMENT.md) for the deep-dive, [PRODUCTION.md](PRODUCTION.md) for the security/compliance review, [BACKUP_DRILL.md](BACKUP_DRILL.md) for restore practice. **Use this file as the do-it-in-order sheet on launch day.**

> Estimated wall time end-to-end: **30–60 minutes** assuming Vercel and Resend accounts already exist.

---

## Launch state snapshot

Last verified **2026-05-06** against `https://stepsprint.vercel.app` (alias of `stepsprint-kwk4l3slq-hondo4185-5820s-projects.vercel.app`, release `stepsprint-api@b93b018`).

**Green:**

- Production deploy live; `/api/health` returns `{ ok: true, db: "up", release: "stepsprint-api@b93b018" }`.
- Postgres on Marketplace Neon (pooled + non-pooled URLs auto-injected; aliased to `DATABASE_URL` / `DIRECT_URL` at build).
- HTTP security posture (verified live): strict CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS `max-age=31536000; includeSubDomains`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=() microphone=() geolocation=()`, `Referrer-Policy: no-referrer`. Rate limits active (`Ratelimit-Policy: 300;w=900` global, plus an inner 120-window).
- OpenAPI surface gated: `/api/docs` and `/api/openapi.json` both 404 in production.
- CSRF: `/api/csrf-token` returns 200 with `Set-Cookie: stepsprint.csrf=…; Path=/; HttpOnly; Secure; SameSite=None` — double-submit pattern wired correctly.
- Tests: server **107/107**, client **23/23** passing locally (Vitest).
- Audit: client production deps clean; server moderate findings remain in `@prisma/dev` (build-time only; not in the Function runtime) and a transitive `ip-address` XSS in `Address6` HTML methods we never call. Fixes are breaking and not safe to force without a tested major upgrade — defer.
- Production env set on Vercel: `JWT_SECRET`, `APP_ORIGIN`, `ADMIN_PASSWORD`, `CRON_SECRET`, `REMINDER_USE_EXTERNAL_CRON`, all `VAPID_*`, full Neon `POSTGRES_*` cluster.

**Yellow / pending — needs operator input (cannot be done by an automated agent):**

- **Email transport not configured.** `transactionalEmail: "allow_without_flag"` on `/api/health` (i.e. `ALLOW_PRODUCTION_WITHOUT_EMAIL=true` is set as the escape hatch). Registration verification and password reset will not deliver mail. Closed-beta only until a `RESEND_API_KEY` (or SMTP) + `SMTP_FROM` is added and the escape-hatch flag is removed.
- **Observability disabled.** No `SENTRY_DSN`, `VITE_SENTRY_DSN`, or `VITE_POSTHOG_KEY`. Errors and analytics are silent.
- **Source-map upload off.** No `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`. Vite emits hidden source maps locally but does not upload — Sentry traces will be minified once a DSN is configured.
- **Wearables OAuth disabled.** Apple Health via Shortcuts works (no server secrets needed). Fitbit, Google Fit, and Garmin OAuth are off — no `*_CLIENT_ID` / `*_CLIENT_SECRET` pairs configured.
- **Legal copy not reviewed.** `VITE_LEGAL_CONTENT_REVIEWED` unset → the draft banner renders on `/privacy` and `/terms`. Replace placeholder copy in `client/src/i18n/{en,es}.json` and flip the flag.
- **Cron live-fire untested.** Hourly schedule registered via `vercel.json`. The `Authorization: Bearer <CRON_SECRET>` handshake cannot be verified from outside the Vercel dashboard because `vercel env pull` correctly redacts sensitive values. Run from the dashboard: project → **Cron** tab → **Run** on `/api/cron/reminder-sweep`, expect 200.
- **Manual smoke walkthrough.** §5 below requires a real inbox + browser session — not automatable.

When picking up from this snapshot, see §3 for the env-var operator checklist, §5 for the manual smokes, §6 for OAuth, §7 for legal copy + backup drill.

---

## 0. Pre-flight (local, ~5 min)

```bash
npm test                # 100+ tests must pass
npm run lint            # client eslint clean
npm run build           # client + server build
```

If any step fails, fix before proceeding. CI on `master` must also be green.

---

## 1. Create the Vercel project (~5 min)

1. **Vercel dashboard → Add New → Project**, import this repo.
2. Vercel reads `vercel.json` — framework `vite`, install + build commands, the `api/[...all].js` Function (1 GB / 30 s), and the hourly Cron entry. Don't override these in the dashboard.
3. **Don't deploy yet.** Provision the database + secrets first so the first build can run migrations and seed the admin.

---

## 2. Provision Postgres (Vercel Marketplace, ~3 min)

1. In your project → **Storage → Create → Neon Postgres** (Vercel Marketplace).
2. Wait for the integration to finish. Vercel automatically populates `POSTGRES_PRISMA_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (direct) — `scripts/vercel-build.mjs` aliases them to `DATABASE_URL` / `DIRECT_URL` at build time, so Prisma works without extra wiring.
3. (Optional) Enable Neon dev branches per Preview deploy in the Marketplace settings — gives every PR its own ephemeral Postgres.

---

## 3. Set the launch-blocking env vars (~5 min)

In Vercel → project → **Settings → Environment Variables** (Production scope):

| Variable | Value | Why |
|---|---|---|
| `JWT_SECRET` | 48+ random bytes (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) | Required ≥32 chars; the function refuses to boot otherwise. |
| `APP_ORIGIN` | Your real Vercel URL (e.g. `https://stepsprint.vercel.app`) | Cookie binding + post-OAuth redirects. |
| `RESEND_API_KEY` | from resend.com | Without it, the function refuses to boot in production. |
| `SMTP_FROM` | `StepSprint <noreply@yourdomain.com>` | Verified sender required when an email transport is set. |
| `ADMIN_PASSWORD` | strong random | First-deploy admin seed password. If unset, a random one is logged once. |
| `REMINDER_USE_EXTERNAL_CRON` | `true` | Disables the in-process scheduler explicitly (also auto-off when `VERCEL=1`). |
| `CRON_SECRET` | 16+ random chars | Vercel Cron auto-attaches `Authorization: Bearer <CRON_SECRET>` to every scheduled call. |

Recommended on day one:

| Variable | Why |
|---|---|
| `SENTRY_DSN` + `VITE_SENTRY_DSN` | Server + browser error tracking. |
| `VITE_POSTHOG_KEY` | Loads only after the cookie banner is accepted in production. |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | Upload hidden browser source maps at build (release auto-derived from `VERCEL_GIT_COMMIT_SHA`). |

> The SPA does not need `VITE_API_URL` — same-origin means relative `/api/*` paths just work.

---

## 4. First deploy (~5 min)

Push to `master` (auto-deploys via the Vercel git integration) or run from the repo root:

```bash
npx vercel deploy --prod --yes
```

The build runs `scripts/vercel-build.mjs`:

1. Aliases `POSTGRES_PRISMA_URL` → `DATABASE_URL`, `POSTGRES_URL_NON_POOLING` → `DIRECT_URL`.
2. Swaps to `schema.postgresql.prisma` + `migrations_postgres/`.
3. `prisma generate` → `prisma migrate deploy`.
4. `tsc` for the server (`server/dist/app.js` is what the Function imports).
5. `vite build` for the SPA (PWA service worker emitted).

Then, from your machine:

```bash
npm run check:api -- https://<your-vercel-host> --strict
```

`--strict` fails when `release` or `transactionalEmail: configured` are missing — exactly the things that silently break the SPA after deploy.

---

## 5. Post-deploy smoke (~10 min)

Walk this list with a real mailbox:

- [ ] `npm run check:api -- <api-url> --strict` returns OK.
- [ ] **Register** a new account → verification email arrives → link works.
- [ ] **Sign out** then **sign in** with the same account.
- [ ] **Forgot password** → reset email arrives → reset works → old session is invalidated on other devices.
- [ ] Sign in as `admin@stepsprint.local` (password from `ADMIN_PASSWORD` or Function logs) → **change the admin password** via profile.
- [ ] Create the first challenge → generate an invite code → invite flow works end-to-end.
- [ ] Submit one day of steps → leaderboard reflects it.
- [ ] **Cron** → Vercel dashboard → project → **Cron** tab shows `/api/cron/reminder-sweep` scheduled hourly. Wait one hour or hit **Run** to verify the bearer header validates and the sweep returns 200.
- [ ] (If push enabled) Subscribe a device → run the cron → notification arrives.

Record results in your release notes.

---

## 6. Optional integrations (do as many as your launch needs)

- **Web Push** — `npx web-push generate-vapid-keys` → set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel.
- **Fitbit / Google Fit / Garmin** — register the app at each provider, set the redirect URI to `https://<your-vercel-host>/api/integrations/{fitbit|google-fit|garmin}/callback`, then set the `*_CLIENT_ID` / `*_CLIENT_SECRET` pair in Vercel. Half-configured pairs log a warning and disable the integration.
- **Apple Health / Apple Watch** — no server secrets. Users mint a token from the Devices page and POST from iOS Shortcuts to `https://<your-vercel-host>/api/integrations/apple-health`.

---

## 7. Compliance / legal (before public sharing, ~30 min)

1. Replace placeholder copy in `client/src/i18n/en.json` and `client/src/i18n/es.json` for **Privacy** and **Terms** with counsel-approved text and real contact details.
2. Set `VITE_LEGAL_CONTENT_REVIEWED=true` in Vercel and redeploy — the "draft" banner on `/privacy` and `/terms` disappears.
3. Confirm the cookie banner appears on first visit and PostHog only loads after **Accept**.
4. Run `BACKUP_DRILL.md` once: snapshot Postgres → restore to a throwaway DB → boot a Function against it → record RTO/RPO.

---

## 8. Day-2 / monitoring

- Point an external monitor (Better Uptime, Uptime Robot, etc.) at `GET https://<your-vercel-host>/api/health`. Alert on non-200 or `"db": "down"`.
- Watch Sentry server + browser issues for the first 48 hours; the `release` field on `/api/health` should match the SPA error reports (Vercel auto-injects `VERCEL_GIT_COMMIT_SHA` for both).
- Review the **Cron** tab weekly to confirm hourly invocations succeed.
- Schedule the next backup-restore drill (quarterly).

---

## Rollback

- **Anything bad after deploy**: Vercel → Deployments → previous successful deploy → **Promote to Production**. SPA, Function, and Cron all roll back together because they're one deploy.
- **Bad migration**: Vercel won't promote a build whose `prisma migrate deploy` failed. If a destructive migration already shipped, restore the latest Neon backup to a new branch and point `DATABASE_URL` at it before redeploying (see [BACKUP_DRILL.md](BACKUP_DRILL.md)).
- **Broken Cron secret**: temporarily delete `CRON_SECRET` to make the endpoint return 503 (no spam from the platform); fix and reset.

---

_Reviewed: 2026-05-04._
