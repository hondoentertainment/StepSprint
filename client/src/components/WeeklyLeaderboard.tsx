import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getErrorMessage } from "../api";
import type { WeeklyEntry } from "../types";
import { WeekPicker } from "./WeekPicker";
import type { Challenge } from "../types";
import { useWeek } from "../contexts/WeekContext";

type Props = {
  challengeId: string;
  selectedChallenge: Challenge | null;
};

export function WeeklyLeaderboard({ challengeId, selectedChallenge }: Props) {
  const { week, setWeek } = useWeek();
  const weekYear = week.year;
  const weekNumber = week.week;
  const [leaderboard, setLeaderboard] = useState<WeeklyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!challengeId) return;

    setIsLoading(true);
    setError("");
    api<{ leaderboard: WeeklyEntry[] }>(
      `/api/leaderboards/weekly?challengeId=${challengeId}&weekYear=${weekYear}&weekNumber=${weekNumber}`
    )
      .then((data) => setLeaderboard(data.leaderboard))
      .catch((err) => {
        setLeaderboard([]);
        setError(getErrorMessage(err));
      })
      .finally(() => setIsLoading(false));
  }, [challengeId, weekYear, weekNumber]);

  const biggest = leaderboard
    .filter((e) => e.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0];

  return (
    <section className="panel">
      <h2>Weekly Top Steppers</h2>
      {error && <p className="status status-error">{error}</p>}
      {!isLoading && biggest && (
        <div className="spotlight spotlight-improvement">
          <span className="spotlight-label">Biggest improvement</span>
          <span className="spotlight-name">{biggest.name || biggest.email}</span>
          <span className="spotlight-steps">
            +{biggest.delta.toLocaleString()} steps vs last week
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
          <p className="status">Loading weekly leaderboard...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state" role="status">
          <p className="status">No weekly data yet for this selection.</p>
          <Link to="/submit" className="cta-primary" style={{ display: "inline-block" }}>
            Log steps to appear here
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
                <span className="rank">#{index + 1}</span> {entry.name || entry.email}
              </div>
              <div className="meta">
                {entry.steps.toLocaleString()} steps · {entry.trend}
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
