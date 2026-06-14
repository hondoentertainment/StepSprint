// Single Vercel serverless entry that hands every /api/* request to the
// compiled Express app (server/dist/app.js). The app is constructed once per
// Lambda cold start and reused across warm invocations.
//
// Routing: vercel.json rewrites `/api/(.*) -> /api/index` so all sub-paths
// (e.g. /api/auth/login, /api/cron/reminder-sweep, /api/leaderboards/weekly)
// hit this file. We deliberately avoid the bracket catch-all filename
// (`api/[...all].js`) because Vercel's filesystem catch-all has a known
// regression that 404s on multi-segment paths in some configurations.
//
// Build pipeline (vercel.json):
//   1. Swap to schema.postgresql.prisma + migrations_postgres
//   2. cd server && npm ci && prisma generate && prisma migrate deploy
//   3. tsc -> server/dist/*  (this file's import target)
//   4. cd client && vite build
//
// At runtime, Vercel's NFT (Node File Trace) follows this require() chain
// into server/node_modules so Express, Prisma client, Sentry, etc. are
// bundled with the function.

// CRITICAL: Sentry.init() must run BEFORE any module that imports Express
// (per @sentry/node v8+ auto-instrumentation requirements). When this entry
// loaded the compiled app first, Sentry.setupExpressErrorHandler attached to
// an uninitialized client and silently swallowed every error. Initialise
// Sentry first, then load the app.
const { initSentry } = require("../server/dist/sentry");
initSentry();

const mod = require("../server/dist/app");
const app = mod && mod.default ? mod.default : mod;

module.exports = app;
