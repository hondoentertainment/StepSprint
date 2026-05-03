import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "../server");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60_000,
  use: {
    // Use 127.0.0.1 so WebKit on Windows does not prefer IPv6 (::1) when Vite binds IPv4-only.
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 393, height: 851 },
        isMobile: true,
        hasTouch: true,
        isLegacy: false,
      },
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      // Avoid attaching to an unrelated process on :5173 (different host/bind breaks tests mid-run).
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev:e2e",
      url: "http://127.0.0.1:3001/api/health",
      cwd: serverDir,
      // Avoid attaching to an unrelated process on :5173 (different host/bind breaks tests mid-run).
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET || "test-jwt-secret-min-16-chars",
        DATABASE_URL: process.env.DATABASE_URL || "file:./e2e.db",
        NODE_ENV: process.env.NODE_ENV || "development",
      },
    },
  ],
});
