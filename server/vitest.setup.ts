import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-ci-stepsprint-minimum-32-chars";
});
