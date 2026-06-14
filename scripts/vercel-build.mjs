#!/usr/bin/env node
// Vercel build orchestrator. Runs from the repo root.
//
// Steps:
//   1. Map Vercel Postgres env names. Prisma 7 removed datasource.directUrl
//      from the schema (and the `datasourceUrl` constructor option), so
//      migrations and the runtime client both read DATABASE_URL — they just
//      want different values:
//        - `prisma migrate deploy` needs a NON-pooled URL
//          (POSTGRES_URL_NON_POOLING).
//        - The runtime PrismaClient (with @prisma/adapter-pg) wants the
//          pooled URL (POSTGRES_PRISMA_URL).
//      We swap DATABASE_URL between the two for the migrate step here, then
//      restore it; Vercel's auto-injected env vars handle the runtime side.
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

// Step 1 — Vercel Postgres env aliasing for build-time tooling. The
// Marketplace integration provisions POSTGRES_PRISMA_URL (pooled) and
// POSTGRES_URL_NON_POOLING (direct). Default DATABASE_URL to the pooled URL
// so anything that reads it during build (and the runtime client, via Vercel
// auto-injection) gets a sane value. We swap to the non-pooled URL just for
// `prisma migrate deploy` further down.
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
  console.log("[vercel-build] DATABASE_URL ← POSTGRES_PRISMA_URL");
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
  // Run `prisma migrate deploy` with the NON-pooled URL: pgbouncer transaction
  // mode is incompatible with Prisma Migrate's advisory locks and DDL. After
  // migrations finish we restore the pooled URL so anything else in the build
  // step (and the deployed function) sees the runtime-appropriate value.
  const runtimeUrl = process.env.DATABASE_URL;
  const migrateUrl =
    process.env.POSTGRES_URL_NON_POOLING ?? process.env.DIRECT_URL;
  if (migrateUrl && migrateUrl !== runtimeUrl) {
    process.env.DATABASE_URL = migrateUrl;
    console.log(
      "[vercel-build] DATABASE_URL ← POSTGRES_URL_NON_POOLING (for migrate deploy)"
    );
  } else if (!migrateUrl) {
    console.warn(
      "[vercel-build] No POSTGRES_URL_NON_POOLING / DIRECT_URL set — running migrate deploy against DATABASE_URL. " +
        "If you are behind a pooler (Vercel Postgres / Neon / pgbouncer) this may fail; provision the non-pooled URL."
    );
  }
  try {
    run("Apply Postgres migrations", "npx prisma migrate deploy", serverDir);
  } finally {
    if (runtimeUrl && process.env.DATABASE_URL !== runtimeUrl) {
      process.env.DATABASE_URL = runtimeUrl;
      console.log("[vercel-build] DATABASE_URL restored to pooled URL");
    }
  }
} else {
  console.warn(
    "\n[vercel-build] Skipping `prisma migrate deploy` — DATABASE_URL is unset or SQLite. " +
      "Provision Vercel Marketplace Postgres (Neon) and set DATABASE_URL (pooled) + POSTGRES_URL_NON_POOLING (direct), then redeploy."
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
