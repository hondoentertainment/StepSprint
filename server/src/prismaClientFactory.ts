import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/** SQLite (file:) uses the driver adapter; Postgres uses the default engine URL from env. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.startsWith("file:")) {
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}
