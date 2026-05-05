// Vercel serverless catch-all that hands every /api/* request to the compiled
// Express app (server/dist/app.js). The app is constructed once per Lambda
// cold start and reused across warm invocations.
//
// Build pipeline (vercel.json):
//   1. Swap to schema.postgresql.prisma + migrations_postgres
//   2. cd server && npm ci && prisma generate && prisma migrate deploy
//   3. tsc → server/dist/*  (this file's import target)
//   4. cd client && vite build
//
// At runtime, Vercel's NFT (Node File Trace) follows this require() chain into
// server/node_modules so Express, Prisma client, Sentry, etc. are bundled.

const mod = require("../server/dist/app");
const app = mod && mod.default ? mod.default : mod;

module.exports = app;
