import { DateTime } from "luxon";

export type WeekInfo = { year: number; week: number };

export function getWeekForNowInTimezone(timezone?: string): WeekInfo {
  const dt = timezone ? DateTime.now().setZone(timezone) : DateTime.now();
  return { year: dt.weekYear, week: dt.weekNumber };
}

export function parseWeekFromDateStringInTz(dateStr: string, timezone?: string): WeekInfo {
  const base = timezone
    ? DateTime.fromISO(dateStr, { zone: timezone }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
    : DateTime.fromISO(dateStr, { zone: "local" }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  return { year: base.weekYear, week: base.weekNumber };
}

export function weekMondayIsoInTimezone(year: number, week: number, timezone?: string): string {
  const dt = DateTime.fromObject(
    { weekYear: year, weekNumber: week, weekday: 1 },
    timezone ? { zone: timezone } : {}
  );
  return dt.toISODate() ?? "";
}

export function formatWeekRangeLabel(year: number, week: number, timezone?: string): string {
  const monday = DateTime.fromObject(
    { weekYear: year, weekNumber: week, weekday: 1 },
    timezone ? { zone: timezone } : {}
  );
  const sunday = monday.plus({ days: 6 });
  const sameMonth = monday.month === sunday.month;
  const sameYear = monday.year === sunday.year;
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: sameMonth && sameYear ? undefined : "numeric",
  });
  if (sameMonth && sameYear) {
    return `${fmt.format(monday.toJSDate())}–${fmt.format(sunday.toJSDate())}, ${monday.year}`;
  }
  return `${fmt.format(monday.toJSDate())} – ${fmt.format(sunday.toJSDate())}`;
}
