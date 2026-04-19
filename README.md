# StepSprint

StepSprint is a month-long step challenge platform with teams, leaderboards, and an admin console.

## Workspace layout

- `client/` - Vite React + TypeScript frontend
- `server/` - Express + TypeScript API (includes `server/prisma/` — the
  canonical Prisma schema, migrations, and the seed entry point at
  `server/src/seed.ts`)

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies:
   - `cd server && npm install`
   - `cd client && npm install`
3. Run Prisma migrations:
   - `cd server && npm run db:migrate`
   - `cd server && npm run db:seed`
4. Start the servers:
   - `cd server && npm run dev`
   - `cd client && npm run dev`

## Testing

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

## Notes

- The API runs on `http://localhost:3001` by default.
- The frontend runs on `http://localhost:5173`.
- Admin seed user: `admin@stepsprint.local`.

## Screenshots

- `docs/screenshots/home.png`
- `docs/screenshots/admin.png`
