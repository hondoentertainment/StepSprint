import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    globalSetup: [path.resolve(__dirname, "vitest.global-setup.ts")],
    // These are injected before any module is evaluated, so config.ts validation passes.
    env: {
      JWT_SECRET: process.env.JWT_SECRET ?? "test-jwt-secret-ci-stepsprint-minimum-32-chars",
      DATABASE_URL: process.env.DATABASE_URL ?? "file:./test.db",
    },
    setupFiles: [path.resolve(__dirname, "vitest.setup.ts")],
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    /** beforeAll hooks (heavy DB fixtures) exceed default 10s when files run in parallel. */
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
