import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { config } from "./config";

// Use the SQLite driver adapter for file: URLs (dev), bare PrismaClient for
// PostgreSQL (production via DATABASE_URL env var read by the Prisma engine).
function makePrisma(): PrismaClient {
  if (config.databaseUrl.startsWith("file:")) {
    const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

export const prisma = makePrisma();
