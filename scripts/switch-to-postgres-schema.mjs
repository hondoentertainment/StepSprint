#!/usr/bin/env node
/**
 * Point server/prisma at the PostgreSQL schema + migrations (production parity).
 * Run after: docker compose up -d (repo root). Then set DATABASE_URL and migrate.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const server = join(__dirname, "..", "server");
const prisma = join(server, "prisma");

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else cpSync(s, d);
  }
}

if (!existsSync(join(prisma, "schema.postgresql.prisma"))) {
  console.error("Missing server/prisma/schema.postgresql.prisma");
  process.exit(1);
}

cpSync(join(prisma, "schema.postgresql.prisma"), join(prisma, "schema.prisma"));
const mig = join(prisma, "migrations");
if (existsSync(mig)) rmSync(mig, { recursive: true });
copyDir(join(prisma, "migrations_postgres"), join(prisma, "migrations"));

console.log("OK: server/prisma now uses PostgreSQL schema + migrations_postgres.");
console.log("");
console.log("1. DATABASE_URL=postgresql://stepsprint:stepsprint@localhost:5432/stepsprint");
console.log("2. cd server && npx prisma generate && npx prisma migrate deploy && npx prisma db seed");
