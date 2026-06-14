import { PrismaClient } from "@prisma/client";

/**
 * Build a PrismaClient with the right driver adapter for the active
 * `DATABASE_URL`. Prisma 7 removed the `datasourceUrl` constructor option, so
 * an adapter is mandatory.
 *
 * - SQLite (`file:` URL) -> `@prisma/adapter-better-sqlite3` (dev/test only).
 * - Anything else -> `@prisma/adapter-pg` (Postgres; works with Vercel
 *   Postgres / Neon over the standard TCP driver).
 *
 * Both adapters are loaded with CommonJS `require()` so the unused one stays
 * out of the Vercel Function bundle: SQLite ships only in dev, and the
 * `better-sqlite3` native binding would otherwise blow past Vercel's 50 MB
 * unzipped Function limit.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.startsWith("file:")) {
    const adapterModule = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");
    const adapter = new adapterModule.PrismaBetterSqlite3({ url: databaseUrl });
    return new PrismaClient({ adapter } as never);
  }

  const adapterModule = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  const adapter = new adapterModule.PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter } as never);
}
