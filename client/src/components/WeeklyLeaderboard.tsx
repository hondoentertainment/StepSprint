import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { getErrorMessage } from "../api";
import type { WeeklyEntry } from "../types";
import { WeekPicker } from "./WeekPicker";
import type { Challenge } from "../types";
import { useWeek } from "../contexts/useWeek";

type Props = {
  challengeId: string;
  selectedChallenge: Challenge | null;
};

export function WeeklyLeaderboard({ challengeId, selectedChallenge }: Props) {
  const { t } = useTranslation();
  const { week, setWeek } = useWeek();
  const weekYear = week.year;
  const weekNumber = week.week;
  const [leaderboard, setLeaderboard] = useState<WeeklyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!challengeId) return;

    let cancelled = false;

    async function loadLeaderboard() {
      setIsLoading(true);
      setError("");
      try {
        const data = await api<{ leaderboard: WeeklyEntry[] }>(
          `/api/leaderboards/weekly?challengeId=${challengeId}&weekYear=${weekYear}&weekNumber=${weekNumber}`
        );
        if (cancelled) return;
        setLeaderboard(data.leaderboard);
      } catch (err) {
        if (cancelled) return;
        setLeaderboard([]);
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [challengeId, weekYear, weekNumber]);

  const biggest = leaderboard
    .filter((e) => e.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0];

  return (
    <section className="panel">
      <h2>{t("weeklyLeaderboard.title")}</h2>
      {error && <p className="status status-error">{error}</p>}
      {!isLoading && biggest && (
        <div className="spotlight spotlight-improvement">
          <span className="spotlight-label">{t("weeklyLeaderboard.biggestImprovement")}</span>
          <span className="spotlight-name">{biggest.name || biggest.email}</span>
          <span className="spotlight-steps">
            {t("weeklyLeaderboard.vsLastWeek", { delta: biggest.delta.toLocaleString() })}
          </span>
        </div>
      )}
      <WeekPicker
        value={{ year: weekYear, week: weekNumber }}
        onChange={setWeek}
        challengeStart={selectedChallenge?.startDate}
        challengeEnd={selectedChallenge?.endDate}
      />
      {isLoading ? (
        <div className="loading-skeleton">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <p className="status">{t("common.loading")}</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state" role="status">
          <p className="status">{t("weeklyLeaderboard.noEntries")}</p>
          <Link to="/submit" className="cta-primary" style={{ display: "inline-block" }}>
            {t("home.logSteps")}
          </Link>
        </div>
      ) : (
        <div className="list" role="list">
          {leaderboard.map((entry, index) => (
            <div
              key={entry.userId}
              className="list-row"
              role="listitem"
              tabIndex={0}
            >
              <div className="primary">
                <span className="rank">{t("weeklyLeaderboard.rank", { rank: index + 1 })}</span>{" "}
                {entry.name || entry.email}
              </div>
              <div className="meta">
                {entry.steps.toLocaleString()} {t("common.steps")} · {entry.trend}
                {entry.delta !== 0 && (
                  <span className="delta">
                    ({entry.delta > 0 ? "+" : ""}
                    {entry.delta.toLocaleString()} vs last week)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
