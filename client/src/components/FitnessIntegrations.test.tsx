import { describe, it, expect } from "vitest";
import { formatSyncOutcome } from "./syncOutcome";

// Minimal `t` fake: returns the key + a stable JSON of interpolated args so
// each branch is observable without coupling tests to copy text.
function fakeT(key: string, opts?: Record<string, unknown>): string {
  return opts ? `${key}|${JSON.stringify(opts)}` : key;
}

describe("formatSyncOutcome", () => {
  it("uses the no-data branch when imported, updated, and skipped are all zero", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Fitbit",
      { imported: 0, updated: 0, skipped: 0 },
      null,
    );
    expect(out).toContain("integrations.syncResultNoData");
    expect(out).toContain('"name":"Fitbit"');
  });

  it("uses the out-of-window branch when only skipped is non-zero", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Google Fit",
      { imported: 0, updated: 0, skipped: 5 },
      7,
    );
    expect(out).toContain("integrations.syncResultOutOfWindow");
    expect(out).toContain('"skipped":5');
  });

  it("uses the up-to-date branch when only updated is non-zero", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Garmin",
      { imported: 0, updated: 3, skipped: 0 },
      null,
    );
    expect(out).toContain("integrations.syncResultUpToDate");
    expect(out).toContain('"updated":3');
  });

  it("uses the range branch when rangeDays > 1 and there are imports", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Fitbit",
      { imported: 4, updated: 1, skipped: 2 },
      7,
    );
    expect(out).toContain("integrations.syncResultRange");
    expect(out).toContain('"days":7');
  });

  it("uses the single-day success branch when rangeDays is null and there are imports", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Fitbit",
      { imported: 1, updated: 0, skipped: 0 },
      null,
    );
    // Must NOT pick the up-to-date branch — imported > 0.
    expect(out).toContain("integrations.syncResult|");
    expect(out).not.toContain("syncResultRange");
    expect(out).not.toContain("syncResultUpToDate");
  });

  it("uses the single-day success branch when rangeDays is 1", () => {
    const out = formatSyncOutcome(
      fakeT,
      "Fitbit",
      { imported: 1, updated: 0, skipped: 0 },
      1,
    );
    expect(out).toContain("integrations.syncResult|");
    expect(out).not.toContain("syncResultRange");
  });
});
