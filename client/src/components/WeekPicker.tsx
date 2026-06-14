import {
  getISOWeek,
  weekToDate,
  formatWeekRange,
} from "../utils";
import { DateTime } from "luxon";
import {
  parseWeekFromDateStringInTz,
  weekMondayIsoInTimezone,
  formatWeekRangeLabel,
  getWeekForNowInTimezone,
} from "../weekTz";

type WeekInfo = { year: number; week: number };

type Props = {
  value: WeekInfo;
  onChange: (value: WeekInfo) => void;
  challengeStart?: string;
  challengeEnd?: string;
  /** When set, ISO weeks match the challenge timezone (same as server leaderboards). */
  timezone?: string;
};

/** Date-based week picker: pick a week by selecting a date within it */
export function WeekPicker({ value, onChange, challengeStart, challengeEnd, timezone }: Props) {
  const mondayOfWeek = timezone
    ? weekMondayIsoInTimezone(value.year, value.week, timezone)
    : weekToDate(value.year, value.week);
  const min = challengeStart || "2020-01-01";
  const max = challengeEnd || "2030-12-31";

  function handleDateChange(dateStr: string) {
    const { year, week } = timezone
      ? parseWeekFromDateStringInTz(dateStr, timezone)
      : (() => {
          const d = new Date(dateStr + "T12:00:00");
          return getISOWeek(d);
        })();
    onChange({ year, week });
  }

  function goToThisWeek() {
    onChange(getWeekForNowInTimezone(timezone));
  }

  function goToPreviousWeek() {
    if (timezone) {
      const m = DateTime.fromObject(
        { weekYear: value.year, weekNumber: value.week, weekday: 1 },
        { zone: timezone }
      ).minus({ weeks: 1 });
      onChange({ year: m.weekYear, week: m.weekNumber });
      return;
    }
    const mondayStr = weekToDate(value.year, value.week);
    const monday = new Date(mondayStr + "T12:00:00");
    monday.setDate(monday.getDate() - 7);
    onChange(getISOWeek(monday));
  }

  const nowWeek = getWeekForNowInTimezone(timezone);
  const isThisWeek = value.year === nowWeek.year && value.week === nowWeek.week;
  const rangeLabel = timezone
    ? formatWeekRangeLabel(value.year, value.week, timezone)
    : formatWeekRange(value.year, value.week);

  return (
    <div className="week-picker">
      <div className="week-picker row">
        <label>
          Week of
          <input
            type="date"
            value={mondayOfWeek}
            onChange={(e) => handleDateChange(e.target.value)}
            min={min}
            max={max}
            title="Pick a date to select its week"
          />
        </label>
        <span className="week-picker-label" aria-live="polite">
          {rangeLabel}
        </span>
      </div>
      <div className="week-picker-shortcuts row">
        <button
          type="button"
          className="secondary"
          onClick={goToThisWeek}
          disabled={isThisWeek}
          aria-label="Show this week"
        >
          This week
        </button>
        <button
          type="button"
          className="secondary"
          onClick={goToPreviousWeek}
          aria-label="Show previous week"
        >
          Previous week
        </button>
      </div>
    </div>
  );
}
