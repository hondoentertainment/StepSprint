#!/usr/bin/env node
// Vercel build orchestrator. Runs from the repo root.
//
// Steps:
//   1. Map Vercel Postgres env names (POSTGRES_PRISMA_URL → DATABASE_URL,
//      POSTGRES_URL_NON_POOLING → DIRECT_URL) so the rest of the pipeline
//      and the deployed function see the names Prisma's schema expects.
//   2. Swap server/prisma to the PostgreSQL schema + migrations_postgres.
//   3. cd server && prisma generate.
//   4. cd server && prisma migrate deploy   (skipped if DATABASE_URL is unset
//      or points at SQLite — first-deploy convenience before the DB is wired).
//   5. cd server && tsc → server/dist/* (the file api/[...all].js requires).
//   6. cd client && vite build (PWA + assets).
//
// Run: `node scripts/vercel-build.mjs` (configured as `buildCommand` in vercel.json).

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const serverDir = resolve(repoRoot, "server");
const clientDir = resolve(repoRoot, "client");

// Step 1 — Vercel Postgres env aliasing. The Marketplace integration provisions
// POSTGRES_PRISMA_URL (pooled) and POSTGRES_URL_NON_POOLING (direct). Prisma's
// schema expects DATABASE_URL / DIRECT_URL. Aliasing here keeps the schema
// portable to other Postgres providers (Neon, Supabase, RDS) without code
// changes — operators just set DATABASE_URL/DIRECT_URL directly.
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
  console.log("[vercel-build] DATABASE_URL ← POSTGRES_PRISMA_URL");
}
if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
  process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
  console.log("[vercel-build] DIRECT_URL ← POSTGRES_URL_NON_POOLING");
}

function run(label, command, cwd) {
  console.log(`\n> ${label}`);
  console.log(`  $ ${command}   (cwd=${cwd})`);
  execSync(command, { cwd, stdio: "inherit", shell: true });
}

run(
  "Swap to PostgreSQL Prisma schema + migrations",
  "node scripts/switch-to-postgres-schema.mjs",
  repoRoot
);

run("Generate Prisma client", "npx prisma generate", serverDir);

const dbUrl = process.env.DATABASE_URL ?? "";
const canMigrate = dbUrl.length > 0 && !dbUrl.startsWith("file:");
if (canMigrate) {
  // Prisma uses `directUrl` for migrations (bypasses the pooler). When the
  // operator supplies only a single URL we let `migrate deploy` fall back to
  // DATABASE_URL — it works for non-pooled DBs.
  if (!process.env.DIRECT_URL) {
    console.warn(
      "[vercel-build] DIRECT_URL is unset — `prisma migrate deploy` will use DATABASE_URL. " +
        "If you are behind a pooler (Vercel Postgres / Neon / pgbouncer) provide POSTGRES_URL_NON_POOLING or DIRECT_URL."
    );
  }
  run("Apply Postgres migrations", "npx prisma migrate deploy", serverDir);
} else {
  console.warn(
    "\n[vercel-build] Skipping `prisma migrate deploy` — DATABASE_URL is unset or SQLite. " +
      "Provision Vercel Marketplace Postgres (Neon) and set DATABASE_URL + DIRECT_URL, then redeploy."
  );
}

run("Build server (tsc)", "npm run build", serverDir);

if (!existsSync(resolve(serverDir, "dist", "app.js"))) {
  console.error(
    "[vercel-build] Expected server/dist/app.js after tsc — function shim will fail."
  );
  process.exit(1);
}

run("Build client (vite + PWA)", "npm run build", clientDir);

console.log("\nVercel build pipeline complete.");
