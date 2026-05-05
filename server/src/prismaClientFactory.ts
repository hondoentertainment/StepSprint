import { PrismaClient } from "@prisma/client";

/**
 * SQLite (file:) uses a driver adapter; Postgres uses Prisma's default engine
 * with the URL pulled from `env("DATABASE_URL")` in `schema.prisma`.
 *
 * The SQLite adapter is required lazily so production bundles (Vercel
 * Functions, any serverless runtime targeting Postgres) do not pull in
 * `better-sqlite3`'s native binding, which is dev-only and would inflate the
 * bundle past Vercel's 50 MB unzipped limit.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.startsWith("file:")) {
    // CommonJS require keeps this synchronous; the dependency only resolves
    // when SQLite is actually requested.

    const adapterModule = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");
    const adapter = new adapterModule.PrismaBetterSqlite3({ url: databaseUrl });
    return new PrismaClient({ adapter } as never);
  }
  return new PrismaClient();
}
