import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("analytics consent (production build flags)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
  });

  it("withholds analytics until the user accepts", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_POSTHOG_KEY", "ph_test_key");

    const mod = await import("./analytics");
    expect(mod.hasAnalyticsConsent()).toBe(false);
    expect(mod.shouldPromptAnalyticsConsent()).toBe(true);
    mod.grantAnalyticsConsent();
    expect(mod.hasAnalyticsConsent()).toBe(true);
    expect(mod.shouldPromptAnalyticsConsent()).toBe(false);
  });

  it("hides the prompt after the user declines", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_POSTHOG_KEY", "ph_test_key");

    const mod = await import("./analytics");
    mod.declineAnalyticsConsent();
    expect(mod.hasAnalyticsConsent()).toBe(false);
    expect(mod.shouldPromptAnalyticsConsent()).toBe(false);
  });
});
