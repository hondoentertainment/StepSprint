import { DateTime } from "luxon";

export function toDateOnly(dateISO: string, tz: string) {
  return DateTime.fromISO(dateISO, { zone: tz }).startOf("day");
}

export function toJsDate(dateTime: DateTime) {
  return dateTime.toJSDate();
}

export function sameMonthRange(startISO: string, endISO: string, tz: string) {
  const start = toDateOnly(startISO, tz);
  const end = toDateOnly(endISO, tz);
  return start.year === end.year && start.month === end.month && end >= start;
}

export function getIsoWeekRange(weekYear: number, weekNumber: number, tz: string) {
  const start = DateTime.fromObject(
    { weekYear, weekNumber, weekday: 1 },
    { zone: tz }
  ).startOf("day");
  const end = start.plus({ days: 6 }).endOf("day");
  return { start, end };
}

export function getTodayRange(tz: string) {
  const start = DateTime.now().setZone(tz).startOf("day");
  const end = start.endOf("day");
  return { start, end };
}

export function getWeekRange(tz: string) {
  const start = DateTime.now().setZone(tz).startOf("week");
  const end = start.endOf("week");
  return { start, end };
}

export function getMonthRange(tz: string) {
  const start = DateTime.now().setZone(tz).startOf("month");
  const end = start.endOf("month");
  return { start, end };
}
