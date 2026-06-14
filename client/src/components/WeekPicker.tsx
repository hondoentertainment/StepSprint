import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const weekRangeLocale = i18n.language?.startsWith("es") ? "es-ES" : "en-US";
  const mondayOfWeek = weekToDate(value.year, value.week);
  const min = challengeStart || "2020-01-01";
  const max = challengeEnd || "2030-12-31";

  const thisWeek = getISOWeek(new Date());
  const isThisWeek = value.year === thisWeek.year && value.week === thisWeek.week;

  // Compute boundary weeks to disable next/prev when at challenge limits
  const minWeek = getISOWeek(new Date(min + "T12:00:00"));
  const maxWeek = getISOWeek(new Date(max + "T12:00:00"));
  const isAtMin = value.year === minWeek.year && value.week <= minWeek.week;
  const isAtMax = value.year === maxWeek.year && value.week >= maxWeek.week;

  function handleDateChange(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    const { year, week } = getISOWeek(d);
    onChange({ year, week });
  }

  function goToThisWeek() {
    onChange({ year: thisWeek.year, week: thisWeek.week });
  }

  function shiftWeek(delta: number) {
    const mondayStr = weekToDate(value.year, value.week);
    const monday = new Date(mondayStr + "T12:00:00");
    monday.setDate(monday.getDate() + delta * 7);
    const { year, week } = getISOWeek(monday);
    onChange({ year, week });
  }

  return (
    <div className="week-picker-v2">
      <div className="week-nav">
        <button
          type="button"
          className="week-nav-arrow secondary"
          onClick={() => shiftWeek(-1)}
          disabled={isAtMin}
          aria-label={t("weekPicker.previousWeek")}
        >
          &#8592;
        </button>
        <div className="week-nav-center">
          <label className="week-nav-label" aria-live="polite">
            <span className="week-range">{formatWeekRange(value.year, value.week, weekRangeLocale)}</span>
            <span className="week-number">{t("weekPicker.weekNumber", { week: value.week })}</span>
          </label>
          <input
            type="date"
            value={mondayOfWeek}
            onChange={(e) => handleDateChange(e.target.value)}
            min={min}
            max={max}
            title={t("weekPicker.pickDate")}
            className="week-date-input"
            aria-label={t("weekPicker.jumpToWeek")}
          />
        </div>
        <button
          type="button"
          className="week-nav-arrow secondary"
          onClick={() => shiftWeek(1)}
          disabled={isAtMax || isThisWeek}
          aria-label={t("weekPicker.nextWeek")}
        >
          &#8594;
        </button>
      </div>
      {!isThisWeek && (
        <div className="week-this-week-row">
          <button
            type="button"
            className="secondary"
            onClick={goToThisWeek}
            aria-label={t("weekPicker.showThisWeek")}
          >
            {t("weekPicker.thisWeek")}
          </button>
        </div>
      )}
    </div>
  );
}
