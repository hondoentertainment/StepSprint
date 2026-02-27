import { describe, it, expect } from "vitest";
import { todayInTimezone, getISOWeek, formatWeekRange, isValidEmail, isFutureDate } from "./utils";

describe("todayInTimezone", () => {
  it("returns date in YYYY-MM-DD format", () => {
    const result = todayInTimezone();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses provided timezone", () => {
    const result = todayInTimezone("America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getISOWeek", () => {
  it("returns year and week number", () => {
    const result = getISOWeek(new Date());
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("week");
    expect(typeof result.year).toBe("number");
    expect(typeof result.week).toBe("number");
    expect(result.week).toBeGreaterThanOrEqual(1);
    expect(result.week).toBeLessThanOrEqual(53);
  });

  it("returns correct week for known date", () => {
    // Jan 6, 2024 is week 1 (ISO week starts Monday)
    const result = getISOWeek(new Date(2024, 0, 6));
    expect(result.year).toBe(2024);
    expect(result.week).toBe(1);
  });
});

describe("formatWeekRange", () => {
  it("returns formatted date range for week", () => {
    const result = formatWeekRange(2025, 7);
    expect(result).toMatch(/^\w{3} \d+–/);
    expect(result).toContain("2025");
  });
});

describe("isValidEmail", () => {
  it("returns true for valid emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("user@example.com")).toBe(true);
  });
  it("returns false for invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("@b.co")).toBe(false);
    expect(isValidEmail("a@")).toBe(false);
  });
});

describe("isFutureDate", () => {
  it("returns true when date is after today", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const str = tomorrow.toISOString().slice(0, 10);
    expect(isFutureDate(str)).toBe(true);
  });
  it("returns false for today or past", () => {
    const today = todayInTimezone();
    expect(isFutureDate(today)).toBe(false);
  });
});
