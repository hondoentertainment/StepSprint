# StepSprint Product Requirements Document

[Master roadmap (priorities & phases)](MASTER_ROADMAP.md)

## Vision

StepSprint is a month-long step challenge platform that helps organizations run team-based fitness competitions. Teams compete on cumulative steps, building habits through accountability and friendly competition.

---

## Goals

- **Engage participants** with simple step logging, streaks, and leaderboards
- **Empower admins** to create challenges, manage participants, and moderate submissions
- **Scale reliably** from small groups to hundreds of participants
- **Ship quality** with automated tests and clear deployment paths

---

## User Personas

| Persona | Role | Needs |
|---------|------|-------|
| **Participant** | User in a challenge | Log steps, see personal stats and team rank, stay motivated |
| **Admin** | Challenge creator/organizer | Create challenges, add participants, assign teams, moderate data, export results |

---

## Core Flows

### Participant flow

1. Sign in (email/password, email verification optional per deployment)
2. Select active challenge
3. Log daily steps from Submit tab
4. View Home: today, streak, consistency, team rank, gap to #1
5. View Weekly Top Steppers and Team Standings leaderboards
6. Optional: connect Fitbit / Google Fit (OAuth when server configured), Apple Watch shortcut token + `/api/integrations/apple-health`, or CSV bulk import

### Admin flow

1. Create challenge (name, dates, timezone, team size)
2. Add participants by email (comma-separated)
3. Assign teams (random or snake draft)
4. Lock challenge when ready
5. Moderate submissions (edit/delete with reason)
6. Invite participants via per-email JWT link or shareable rotating challenge invite code (`/invite` + code flows)
7. Review analytics dashboard (participation, dormant members, submissions-by-day chart)
8. Export CSV (submissions, teams, weekly leaderboard)

---

## Feature Requirements

### Implemented

- [x] Email-based registration with password authentication, password reset, and optional verification mail (Resend or SMTP when configured)
- [x] Challenge CRUD, lock/unlock, timezone
- [x] Participant enrollment by email; invite JWT links + challenge invite codes (`/invite` page UX)
- [x] Team assignment (random, snake)
- [x] Step submission; high-step flagging (>100k)
- [x] Personal summary (today, week, month, streak, consistency, rank, gap)
- [x] Weekly and team leaderboards; date-based ISO week picker
- [x] Admin moderation (edit/delete submissions) with audit
- [x] CSV exports (submissions, teams, weekly) using API-linked downloads in hosted environments
- [x] Admin analytics: participation, never-logged count, dormant (7-day) count, submissions-by-day trend
- [x] Reminders (opt-in `dailyReminder`): Web Push where VAPID is configured + email where Resend/SMTP configured; hourly sweep at each challenge’s local reminder hour (`REMINDER_NOTIFICATION_HOUR_LOCAL`)
- [x] Fitness integrations: Apple Watch Shortcut token endpoint; OAuth Fitbit and Google Fit (connect/sync/disconnect); server reports provider availability accurately
- [x] PostgreSQL-ready schema + single-Vercel deploy (SPA + Function + Vercel Postgres via Marketplace Neon), Docker Compose for optional local Postgres, SQLite for dev defaults
- [x] Security: CSP on API (+ Swagger carve-out), CSP connect-src on Vercel client; JWT session cookies with `SameSite=None` + `Secure` in production split hosting; CSRF double-submit on mutating API calls in production; rate limiting tiers in production
- [x] Unit, API, and E2E tests; OpenAPI `/api/docs`

### Improvements roadmap (stretch)

- [x] Dedicated admin cohort analytics (benchmark table across challenges; optional **re-engagement / churn-risk count** — participants who logged at least once but have no submission in the dormant window; fuller forecasting remains future work)
- [x] **Health platform scope (roadmap decision)** — The web/PWA client does not target in-browser Apple HealthKit or Android Health Connect reads (browser APIs do not allow it). **Supported:** iOS Shortcuts posting to `/api/integrations/apple-health` with a user-generated bearer token; OAuth for Fitbit, Google Fit, and Garmin when the server is registered with each provider (production always uses each vendor’s developer program / OAuth client where applicable). **Future optional:** a native shell (for example Capacitor) could add HealthKit or Health Connect; that is not part of the current PWA scope.
- [x] Broader **i18n** — Primary participant and admin UI strings live in `client/src/i18n/en.json` (including fitness sync, cohort analytics, and core flows). Add languages by registering locale resources in `client/src/i18n`.
- [x] **Cron webhook** — `POST /api/cron/reminder-sweep` with `Authorization: Bearer <REMINDER_CRON_SECRET>` when `REMINDER_USE_EXTERNAL_CRON=true`
- [x] Postgres migration parity CI job (`server-test-postgres` in GitHub Actions; SQLite remains the default local dev DB)

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Time to submit steps | < 30 seconds |
| Admin: create challenge end-to-end | < 5 minutes |
| E2E test pass rate | 100% |
| Mobile layout | Usable on 320px width |

---

## Out of Scope (for now)

- Multi-tenancy / white-label
- Native mobile apps beyond PWA installation
- Real-time leaderboard websockets (polling only)
- Social sharing / badges

---

## Technical Constraints

- SQLite in local dev; PostgreSQL on Render blueprint
- JWT in HTTP-only cookies for SPA (cross-origin safe in prod with SameSite=None)
- Vite + React frontend; Express API
- Prisma ORM

---

## Appendix: Terminology

| Term | Definition |
|------|-------------|
| Challenge | A time-bounded step competition (e.g., "March Madness Steps") |
| Team | Group of participants within a challenge |
| Submission | One user's step count for one date |
| Streak | Consecutive days with step submissions |
| Consistency | Active days / elapsed days in challenge |
