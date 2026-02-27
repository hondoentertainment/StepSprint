import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-min-16-chars";
});
