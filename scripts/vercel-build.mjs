#!/usr/bin/env node
// Vercel build orchestrator. Runs from the repo root.
//
// Steps:
//   1. Swap server/prisma to the PostgreSQL schema + migrations_postgres.
//   2. cd server && prisma generate.
//   3. cd server && prisma migrate deploy   (skipped if DATABASE_URL is unset
//      or points at SQLite — first-deploy convenience before the DB is wired).
//   4. cd server && tsc → server/dist/* (the file api/[...all].js requires).
//   5. cd client && vite build (PWA + assets).
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

function run(label, command, cwd) {
  console.log(`\n› ${label}`);
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
  run("Apply Postgres migrations", "npx prisma migrate deploy", serverDir);
} else {
  console.warn(
    "\n[vercel-build] Skipping `prisma migrate deploy` — DATABASE_URL is unset or SQLite. " +
      "Provision Vercel Marketplace Neon Postgres and set DATABASE_URL + DIRECT_URL, then redeploy."
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

console.log("\n✓ Vercel build pipeline complete.");
