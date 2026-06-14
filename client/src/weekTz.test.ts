import { describe, it, expect } from "vitest";
import { getWeekForNowInTimezone, weekMondayIsoInTimezone, parseWeekFromDateStringInTz } from "./weekTz";

describe("weekTz", () => {
  it("computes Monday ISO for a Chicago week", () => {
    const monday = weekMondayIsoInTimezone(2025, 15, "America/Chicago");
    expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("round-trips date selection in a timezone", () => {
    const w = parseWeekFromDateStringInTz("2025-04-14", "America/Chicago");
    const back = weekMondayIsoInTimezone(w.year, w.week, "America/Chicago");
    expect(back).toBe("2025-04-14");
  });

  it("returns a week for now without timezone", () => {
    const w = getWeekForNowInTimezone();
    expect(w.year).toBeGreaterThan(2020);
    expect(w.week).toBeGreaterThan(0);
  });
});
