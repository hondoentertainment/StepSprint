import { getISOWeek, weekToDate, formatWeekRange } from "../utils";

type WeekInfo = { year: number; week: number };

type Props = {
  value: WeekInfo;
  onChange: (value: WeekInfo) => void;
  challengeStart?: string;
  challengeEnd?: string;
};

/** Date-based week picker: pick a week by selecting a date within it */
export function WeekPicker({ value, onChange, challengeStart, challengeEnd }: Props) {
  const mondayOfWeek = weekToDate(value.year, value.week);
  const min = challengeStart || "2020-01-01";
  const max = challengeEnd || "2030-12-31";

  function handleDateChange(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    const { year, week } = getISOWeek(d);
    onChange({ year, week });
  }

  function goToThisWeek() {
    const now = getISOWeek(new Date());
    onChange({ year: now.year, week: now.week });
  }

  function goToPreviousWeek() {
    const mondayStr = weekToDate(value.year, value.week);
    const monday = new Date(mondayStr + "T12:00:00");
    monday.setDate(monday.getDate() - 7);
    const { year, week } = getISOWeek(monday);
    onChange({ year, week });
  }

  const isThisWeek =
    value.year === getISOWeek(new Date()).year && value.week === getISOWeek(new Date()).week;

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
          {formatWeekRange(value.year, value.week)}
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
