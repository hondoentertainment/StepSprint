import { execSync } from "child_process";
import path from "path";

/**
 * Apply migrations to the same SQLite file Vitest uses (DATABASE_URL or file:./test.db)
 * so `npm run test:run` works on a fresh clone without a separate migrate step.
 */
export default function globalSetup(): void {
  const cwd = path.resolve(__dirname);
  const databaseUrl = process.env.DATABASE_URL ?? "file:./test.db";
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    // Ensure seed creates demo participants (not production-admin-only seed).
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };
  execSync("npx prisma migrate deploy", {
    cwd,
    stdio: "inherit",
    env,
    shell: true,
  });
  execSync("npx prisma db seed", {
    cwd,
    stdio: "inherit",
    env,
    shell: true,
  });
}
