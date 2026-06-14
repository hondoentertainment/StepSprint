import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.resolve(__dirname, "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stepsprint?schema=public",
  },
});
