# StepSprint

StepSprint is a month-long step challenge platform with teams, leaderboards, and an admin console. It deploys as a single **Vercel** project: SPA + serverless Express API + Vercel Postgres (Neon) + Vercel Cron.

See [docs/LAUNCH.md](docs/LAUNCH.md) for the ordered launch-day runbook, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deep dive, and [docs/PRODUCTION.md](docs/PRODUCTION.md) for the production-readiness review.

## Workspace layout

- `client/` - Vite React + TypeScript frontend (PWA)
- `server/` - Express + TypeScript API (includes `server/prisma/` — the
  canonical Prisma schema, migrations, and the seed entry point at
  `server/src/seed.ts`)
- `api/[...all].js` - Vercel Function shim that mounts the compiled Express
  app (`server/dist/app.js`) at `/api/*`
- `scripts/vercel-build.mjs` - build orchestrator used by Vercel

## Setup

1. Copy `.env.example` to `.env` and fill in values (including `DATABASE_URL` for PostgreSQL).
2. Start PostgreSQL, for example: `docker compose up -d` from this repo (uses `docker-compose.yml`).
3. Install dependencies:
   - `cd server && npm install`
   - `cd client && npm install`
4. Apply the database schema and seed data:
   - `cd server && npm run db:push`
   - `cd server && npm run db:seed`
5. Start the servers:
   - `cd server && npm run dev`
   - `cd client && npm run dev`

## Testing

Integration tests on the server hit a real PostgreSQL database. Start Postgres (`docker compose up -d`), apply the schema (`cd server && npm run db:push`), and seed (`cd server && npm run db:seed`) before `npm run test:server`.

### Unit & integration tests
```bash
npm test              # Run all tests (client + server)
npm run test:client   # Client unit tests (Vitest)
npm run test:server   # Server unit + API tests (Vitest + Supertest)
npm run test:coverage # Run with coverage
```

### E2E tests (Playwright)
```bash
npm run test:e2e      # From client/ - runs desktop + mobile E2E
cd client && npm run test:e2e:ui   # Interactive UI mode
```

**Prerequisites:** Database seeded, `.env` with `JWT_SECRET`.

## Mobile E2E tests

Playwright runs end-to-end tests against mobile viewports (Pixel 5, iPhone 13).

**Prerequisites:** Ensure the database is seeded and `.env` has `JWT_SECRET` (see Setup).

```bash
cd client && npm run test:e2e
```

For UI mode: `npm run test:e2e:ui`

The test suite will start both client and server automatically. Tests use `user1@stepsprint.local` from the seed data.

## Database configuration

- The active development database is **SQLite**, wired up via `@prisma/adapter-better-sqlite3`. The schema lives in `prisma/schema.prisma` and the default `DATABASE_URL` in `.env.example` is `file:./dev.db`.
- `prisma/schema.postgresql.prisma` is the **planned production schema** for when StepSprint migrates to PostgreSQL. It is kept in the repo intentionally; do not delete it.
- When modifying models, update **both** `prisma/schema.prisma` and `prisma/schema.postgresql.prisma` so the two stay in sync. This keeps the future Postgres migration a straightforward swap.

## Notes

- The API runs on `http://localhost:3001` by default.
- The frontend runs on `http://localhost:5173`.
- Admin seed user: `admin@stepsprint.local`.

## Screenshots

- `docs/screenshots/home.png`
- `docs/screenshots/admin.png`
