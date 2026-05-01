import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // These are injected before any module is evaluated, so config.ts validation passes.
    env: {
      JWT_SECRET: process.env.JWT_SECRET ?? "test-jwt-secret-min-16-chars",
      DATABASE_URL: process.env.DATABASE_URL ?? "file:./test.db",
    },
    setupFiles: [path.resolve(__dirname, "vitest.setup.ts")],
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
