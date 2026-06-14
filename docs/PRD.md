# StepSprint Product Requirements Document

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
1. Sign in (email and password — optional password reset via email when SMTP is configured)
2. Select active challenge
3. Log daily steps from Submit tab (manual or imported from a connected fitness provider)
4. View Home: today, streak, consistency, team rank, gap to #1
5. View Weekly Top Steppers and Team Standings leaderboards

### Admin flow
1. Create challenge (name, dates, timezone, team size)
2. Add participants by email (comma-separated) or invite link
3. Assign teams (random or snake draft)
4. Lock challenge when ready
5. Moderate submissions (edit/delete with reason)
6. Review analytics (participation, weekly trend, inactive members) and export CSV (submissions, teams, weekly leaderboard, participation summary)

---

## Feature Requirements

### Implemented (v1)

- [x] Email-based auth with password; optional forgot/reset password when SMTP is configured
- [x] Challenge CRUD, lock/unlock, timezone
- [x] Participant enrollment by email
- [x] Team assignment (random, snake)
- [x] Step submission, high-step flagging (>100k); submissions tagged **manual** vs **import**
- [x] **Fitness integrations** — Fitbit and Google Fit (Fitness REST) OAuth, encrypted token storage, scheduled + on-demand sync for the last 14 days; imports do not overwrite manual entries for the same day
- [x] Personal summary (today, week, month, streak, consistency, rank, gap)
- [x] Weekly and team leaderboards; week selection aligned to challenge timezone
- [x] Admin moderation (edit/delete submissions) with audit; edits mark rows as manual again
- [x] CSV exports (submissions including source, teams, weekly, **participation summary**)
- [x] **Notifications** — Email preferences (daily reminder, streak at risk) and scheduled reminder job (SMTP + cron env)
- [x] **Analytics** — Admin API and UI: participation rate, inactive count, totals, weekly trend bars, inactive participant list
- [x] **Invite flow** — Admin creates invite links; optional invite email when SMTP is configured; `/invite` acceptance page
- [x] **Production readiness** — PostgreSQL (`docker compose` in repo), `/api/health` with DB check and uptime, optional `LOG_HTTP=1` request logging, `API_PUBLIC_URL` for OAuth callbacks
- [x] **Rate limiting** on auth and general API routes
- [x] Unit, API, and E2E tests (API tests require a running seeded Postgres database)
- [x] Mobile-responsive layout

### Planned enhancements

- [ ] **Apple Health** — No first-class web integration; document companion/export path if needed
- [ ] **Deeper analytics** — Per-user timelines, richer charts, anomaly detection
- [ ] **Deployment guides** — Hosted reference architecture (e.g. Render/Fly) with worker split for cron-heavy workloads

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
- Native mobile apps
- Real-time leaderboard updates (polling only)
- Social sharing / badges

---

## Technical Constraints

- PostgreSQL for local and production (see repo `docker-compose.yml` and `.env.example`)
- JWT in HTTP-only cookies for auth
- Vite + React frontend; Express API
- Prisma ORM for database
- OAuth tokens at rest are encrypted using a key derived from `JWT_SECRET` (set a strong secret in production)

---

## Appendix: Terminology

| Term | Definition |
|------|------------|
| Challenge | A time-bounded step competition (e.g., "March Madness Steps") |
| Team | Group of participants within a challenge |
| Submission | One user's step count for one date |
| Streak | Consecutive days with step submissions |
| Consistency | Active days / elapsed days in challenge |
