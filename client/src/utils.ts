export function todayInTimezone(timezone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function getISOWeek(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: temp.getUTCFullYear(), week: weekNo };
}

/** Given year + ISO week number, return the Monday of that week as YYYY-MM-DD */
export function weekToDate(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Given year + ISO week number, return formatted date range (e.g. "Feb 10–16, 2025") */
export function formatWeekRange(year: number, week: number): string {
  const mondayStr = weekToDate(year, week);
  const monday = new Date(mondayStr);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: sameMonth && sameYear ? undefined : "numeric",
  });
  if (sameMonth && sameYear) {
    return `${fmt.format(monday)}–${fmt.format(sunday)}, ${monday.getFullYear()}`;
  }
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

/** Basic email format validation */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  const atIndex = trimmed.indexOf("@");
  return atIndex > 0 && atIndex < trimmed.length - 1 && trimmed.includes(".");
}

/** Check if date is in the future (strict: after today in given timezone) */
export function isFutureDate(dateStr: string, timezone?: string): boolean {
  const today = todayInTimezone(timezone);
  return dateStr > today;
}
