import { describe, it, expect } from "vitest";
import { isCsrfValid } from "./csrf";

describe("isCsrfValid", () => {
  it("returns true when cookie and header match", () => {
    expect(isCsrfValid("abc123", "abc123")).toBe(true);
  });

  it("returns false when header is missing", () => {
    expect(isCsrfValid("abc123", undefined)).toBe(false);
  });

  it("returns false when cookie is missing", () => {
    expect(isCsrfValid(undefined, "abc123")).toBe(false);
  });

  it("returns false when tokens differ", () => {
    expect(isCsrfValid("abc123", "xyz789")).toBe(false);
  });

  it("returns false when cookie is empty string", () => {
    expect(isCsrfValid("", "")).toBe(false);
  });

  it("returns false when header is an array (multi-value)", () => {
    expect(isCsrfValid("abc123", ["abc123", "abc123"])).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(isCsrfValid(undefined, undefined)).toBe(false);
  });
});

describe("CSRF cookie endpoint", () => {
  it("GET /api/csrf-token returns a token string", async () => {
    const request = (await import("supertest")).default;
    const app = (await import("../app")).default;
    const res = await request(app).get("/api/csrf-token").expect(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(0);
  });
});
