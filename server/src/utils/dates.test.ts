import { describe, it, expect } from "vitest";
import {
  toDateOnly,
  toJsDate,
  sameMonthRange,
  getIsoWeekRange,
  getTodayRange,
  getWeekRange,
  getMonthRange,
} from "./dates";
import { DateTime } from "luxon";

describe("dates", () => {
  const TZ = "America/Chicago";

  describe("toDateOnly", () => {
    it("parses ISO date string in timezone", () => {
      const result = toDateOnly("2024-06-15", TZ);
      expect(result.zone.name).toBe(TZ);
      expect(result.year).toBe(2024);
      expect(result.month).toBe(6);
      expect(result.day).toBe(15);
      expect(result.hour).toBe(0);
    });
  });

  describe("toJsDate", () => {
    it("converts Luxon DateTime to JS Date", () => {
      const dt = DateTime.fromObject({ year: 2024, month: 6, day: 15 }, { zone: TZ });
      const js = toJsDate(dt);
      expect(js).toBeInstanceOf(Date);
      expect(js.getFullYear()).toBe(2024);
    });
  });

  describe("sameMonthRange", () => {
    it("returns true when start and end are same month", () => {
      expect(sameMonthRange("2024-06-01", "2024-06-30", TZ)).toBe(true);
    });
    it("returns false when different months", () => {
      expect(sameMonthRange("2024-06-01", "2024-07-01", TZ)).toBe(false);
    });
    it("returns false when end before start", () => {
      expect(sameMonthRange("2024-06-30", "2024-06-01", TZ)).toBe(false);
    });
  });

  describe("getIsoWeekRange", () => {
    it("returns start and end of ISO week", () => {
      const { start, end } = getIsoWeekRange(2024, 24, TZ);
      expect(start.weekday).toBe(1);
      expect(start.weekYear).toBe(2024);
      expect(start.weekNumber).toBe(24);
      expect(end.diff(start, "days").days).toBeGreaterThanOrEqual(6);
      expect(end.diff(start, "days").days).toBeLessThanOrEqual(7);
    });
  });

  describe("getTodayRange", () => {
    it("returns start and end of today in timezone", () => {
      const { start, end } = getTodayRange(TZ);
      const now = DateTime.now().setZone(TZ);
      expect(start.hasSame(now, "day")).toBe(true);
      expect(end.hasSame(now, "day")).toBe(true);
    });
  });

  describe("getWeekRange", () => {
    it("returns current week range", () => {
      const { start, end } = getWeekRange(TZ);
      expect(start.weekday).toBe(1);
      expect(end.weekday).toBe(7);
    });
  });

  describe("getMonthRange", () => {
    it("returns current month range", () => {
      const { start, end } = getMonthRange(TZ);
      expect(start.day).toBe(1);
      expect(end.month).toBe(start.month);
    });
  });
});
