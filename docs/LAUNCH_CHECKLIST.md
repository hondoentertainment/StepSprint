# Launch checklist

A single tick-as-you-go list of every action still required to take StepSprint from the current "live but closed-beta" snapshot to a public production deploy. Companion to the narrative runbook in [LAUNCH.md](LAUNCH.md) and the priority lens in [MASTER_ROADMAP.md](MASTER_ROADMAP.md).

State as of 2026-05-08: production deploy is up, security baseline verified, tests green. What remains is operator/secret work and a tested PWA dependency upgrade — none of which an automated agent can do from inside the repo.

Legend: **P0** blocks public launch · **P1** day-one recommended · **P2** when there is appetite.

---

## P0 — Blocks public launch

- [ ] **Provision Resend (or SMTP) and remove the email escape hatch**
  - [ ] Create a Resend account and verify the sending domain.
  - [ ] In Vercel → Settings → Environment Variables (Production): set `RESEND_API_KEY` and `SMTP_FROM` (e.g. `StepSprint <noreply@yourdomain.com>`).
  - [ ] **Remove** `ALLOW_PRODUCTION_WITHOUT_EMAIL` from the Production env.
  - [ ] Redeploy.
  - [ ] Verify: `npm run check:api -- https://<host> --strict` exits 0 and `/api/health` reports `transactionalEmail: "configured"` (not `"allow_without_flag"`).

- [ ] **Cron live-fire**
  - [ ] Vercel dashboard → project → **Cron** → click **Run** on `/api/cron/reminder-sweep`.
  - [ ] Expect HTTP 200 and a corresponding entry in the Function logs.
  - [ ] Confirm the next scheduled hourly run also returns 200.

- [ ] **Manual smoke walkthrough** (LAUNCH.md §5)
  - [ ] Register a brand-new account from a real inbox; click the verification link.
  - [ ] Trigger password reset; confirm the email arrives and the new password works.
  - [ ] Submit steps for today as a participant; confirm leaderboard updates.
  - [ ] Sign in as admin; create a challenge; trigger one moderation action; confirm an `AuditLog` row.
  - [ ] Visit `/privacy` and `/terms`; confirm the draft banner is **gone** (after P1 legal copy lands) or expected (before).

---

## P1 — Day-one recommended

- [ ] **Observability — Sentry**
  - [ ] Create Sentry project(s); copy DSNs.
  - [ ] Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (client) on Production.
  - [ ] Trigger a deliberate error (e.g. visit a nonexistent admin route while signed in) and confirm it lands in Sentry.

- [ ] **Source maps for browser Sentry**
  - [ ] Create a Sentry auth token with `project:releases` scope.
  - [ ] Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` on Production (Build scope is sufficient).
  - [ ] Redeploy; confirm a new Release appears in Sentry with source maps attached and that a captured exception shows un-minified frames.

- [ ] **Analytics — PostHog**
  - [ ] Create the PostHog project; copy the project key.
  - [ ] Set `VITE_POSTHOG_KEY` on Production.
  - [ ] In an incognito window, accept analytics in the cookie banner; confirm events arrive in PostHog (`Login`, `Submit`, challenge view).

- [ ] **Legal copy**
  - [ ] Have counsel review and provide final `/privacy` and `/terms` text.
  - [ ] Update `client/src/i18n/en.json` and `client/src/i18n/es.json` with the approved copy.
  - [ ] Set `VITE_LEGAL_CONTENT_REVIEWED=true` on Production.
  - [ ] Redeploy; confirm the draft banner no longer renders on `/privacy` or `/terms`.

- [ ] **Post-deploy email smoke** (after Resend lands)
  - [ ] Follow [DEPLOYMENT.md → Post-deploy email smoke](DEPLOYMENT.md#post-deploy-email-smoke-recommended).

---

## P2 — When there is appetite

- [ ] **Wearables OAuth providers**
  - [ ] Fitbit: register an app, set `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`.
  - [ ] Google Fit: register OAuth credentials, set `GOOGLE_FIT_CLIENT_ID` and `GOOGLE_FIT_CLIENT_SECRET`.
  - [ ] Garmin: register an app, set `GARMIN_CLIENT_ID` and `GARMIN_CLIENT_SECRET`.
  - [ ] For each provider: connect on `/integrations`, force a sync, confirm a `StepSubmission` row.

- [ ] **Tested PWA dependency upgrade**
  - [ ] Branch from `master`.
  - [ ] Bump `vite-plugin-pwa` and the transitive `workbox-*` chain to clear the client high advisories. Avoid blind `npm audit fix --force`.
  - [ ] Run `cd client && npm run build` and confirm the service worker emits.
  - [ ] Run `npm run test:e2e` (PWA install + offline asserts).
  - [ ] Open a PR; merge only if green.

- [ ] **Backup restore drill**
  - [ ] Follow [BACKUP_DRILL.md](BACKUP_DRILL.md) end-to-end against a Neon branch.
  - [ ] Record the wall-clock time and append to the drill log.

- [ ] **Staging environment**
  - [ ] Enable Neon dev branches per Vercel Preview (Marketplace setting) so each PR gets an ephemeral Postgres.

---

## When everything above is checked

Flip the project from closed-beta to public:

1. Announce in your channel of choice.
2. Watch Sentry, PostHog, and Vercel Function logs for the first hour.
3. Re-run `npm run check:api -- https://<host> --strict` once a day for the first week.
