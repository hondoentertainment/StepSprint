# StepSprint

StepSprint is a month-long step challenge platform with teams, leaderboards, and an admin console.

## Workspace layout

- `client/` - Vite React + TypeScript frontend
- `server/` - Express + TypeScript API
- `prisma/` - Prisma schema, migrations, and seed data

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

## Notes

- The API runs on `http://localhost:3001` by default.
- The frontend runs on `http://localhost:5173`.
- Admin seed user: `admin@stepsprint.local`.

## Screenshots

- `docs/screenshots/home.png`
- `docs/screenshots/admin.png`
