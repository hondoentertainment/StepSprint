import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { track, identify } from "./analytics";

describe("analytics (no-op path)", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it("track() does not throw when VITE_POSTHOG_KEY is unset", () => {
    expect(() => track("some_event")).not.toThrow();
    expect(() => track("some_event", { foo: "bar" })).not.toThrow();
  });

  it("identify() does not throw when VITE_POSTHOG_KEY is unset", () => {
    expect(() => identify("user-123")).not.toThrow();
    expect(() => identify("user-123", { plan: "free" })).not.toThrow();
  });

  it("track() returns undefined synchronously (no-op)", () => {
    const result = track("x");
    expect(result).toBeUndefined();
  });
});
