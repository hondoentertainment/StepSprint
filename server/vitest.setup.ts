import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-min-16-chars";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stepsprint?schema=public";
});
