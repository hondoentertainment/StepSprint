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
1. Sign in (email, optional name)
2. Select active challenge
3. Log daily steps from Submit tab
4. View Home: today, streak, consistency, team rank, gap to #1
5. View Weekly Top Steppers and Team Standings leaderboards

### Admin flow
1. Create challenge (name, dates, timezone, team size)
2. Add participants by email (comma-separated)
3. Assign teams (random or snake draft)
4. Lock challenge when ready
5. Moderate submissions (edit/delete with reason)
6. Export CSV (submissions, teams, weekly leaderboard)

---

## Feature Requirements

### Implemented (v1)

- [x] Email-based auth (no password)
- [x] Challenge CRUD, lock/unlock, timezone
- [x] Participant enrollment by email
- [x] Team assignment (random, snake)
- [x] Step submission, high-step flagging (>100k)
- [x] Personal summary (today, week, month, streak, consistency, rank, gap)
- [x] Weekly and team leaderboards
- [x] Admin moderation (edit/delete submissions) with audit
- [x] CSV exports (submissions, teams, weekly)
- [x] Unit, API, and E2E tests
- [x] Mobile-responsive layout

### Planned enhancements

- [ ] **Fitness integrations** — Import steps from Google Fit, Apple Health, Fitbit
- [ ] **Notifications** — Daily reminder to log steps, streak at risk
- [ ] **Analytics** — Admin dashboard: participation rates, trends, dropout
- [ ] **Invite flow** — Email invite links, onboarding for new users
- [ ] **Production DB** — PostgreSQL support for production deployments
- [ ] **Rate limiting** — Protect API from abuse
- [ ] **Week picker UX** — Date-based week selector instead of manual year/week inputs

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

- Password-based authentication
- Multi-tenancy / white-label
- Native mobile apps
- Real-time leaderboard updates (polling only)
- Social sharing / badges

---

## Technical Constraints

- SQLite for development; PostgreSQL recommended for production
- JWT in HTTP-only cookies for auth
- Vite + React frontend; Express API
- Prisma ORM for database

---

## Appendix: Terminology

| Term | Definition |
|------|------------|
| Challenge | A time-bounded step competition (e.g., "March Madness Steps") |
| Team | Group of participants within a challenge |
| Submission | One user's step count for one date |
| Streak | Consecutive days with step submissions |
| Consistency | Active days / elapsed days in challenge |
