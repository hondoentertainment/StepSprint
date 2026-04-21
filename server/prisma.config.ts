import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.resolve(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
  migrations: {
    seed: "tsx src/seed.ts",
  },
});
