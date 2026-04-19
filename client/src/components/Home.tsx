import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ApiError, getErrorMessage } from "../api";
import { track } from "../analytics";
import type { Challenge } from "../types";
import type { Summary } from "../types";

type Props = {
  challengeId: string;
  selectedChallenge: Challenge | null;
  challengesLoading: boolean;
  challengesError: string;
};

function HomeSkeleton() {
  return (
    <div className="loading-skeleton" aria-label="Loading summary">
      <div className="skeleton skeleton-title" />
      <div className="stats-grid stats-grid-skeleton">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </div>
  );
}

export function Home({
  challengeId,
  selectedChallenge,
  challengesLoading,
  challengesError,
}: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [welcomeMessage] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem("stepSprintJustLoggedIn") !== null;
  });
  const [dailyReminder, setDailyReminder] = useState(false);

  useEffect(() => {
    if (welcomeMessage && typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("stepSprintJustLoggedIn");
    }
    // Only run on mount to clear the one-time flag; subsequent toggles don't retrigger storage clearing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPreferences() {
      try {
        const prefs = await api<{ dailyReminder: boolean }>("/api/me/notifications/preferences");
        if (cancelled) return;
        setDailyReminder(prefs.dailyReminder);
      } catch {
        // ignore; notification preferences are best-effort
      }
    }
    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDailyReminder() {
    const prev = dailyReminder;
    const next = !prev;
    setDailyReminder(next);
    api("/api/me/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ dailyReminder: next }),
    }).catch(() => setDailyReminder(prev));
  }

  useEffect(() => {
    if (!challengeId) return;

    track("challenge_viewed", { challengeId });

    let cancelled = false;

    async function loadSummary() {
      setIsLoading(true);
      setError("");
      try {
        const data = await api<Summary>(`/api/me/summary?challengeId=${challengeId}`);
        if (cancelled) return;
        setSummary(data);
      } catch (err) {
        if (cancelled) return;
        setSummary(null);
        if (err instanceof ApiError && err.status === 403) {
          setError("You are not enrolled in this challenge yet.");
        } else {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  return (
    <section className="panel">
      <h2>Participant Home</h2>
      {welcomeMessage && (
        <p className="status status-success" role="status" aria-live="polite">
          Welcome back! You&apos;ve signed in successfully.
        </p>
      )}
      {challengesError && <p className="status status-error">{challengesError}</p>}
      {selectedChallenge && (
        <span
          className={`challenge-badge ${selectedChallenge.locked ? "locked" : "open"}`}
        >
          {selectedChallenge.name} · {selectedChallenge.timezone} ·{" "}
          {selectedChallenge.locked ? "Locked" : "Open"}
        </span>
      )}
      {challengesLoading ? (
        <HomeSkeleton />
      ) : !challengeId ? (
        <p className="status">No active challenges yet.</p>
      ) : isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        <p className="status status-error">{error}</p>
      ) : summary ? (
        <div className="stats-grid">
          <div className="stats-hero">
            <div className="card card-hero">
              <h3>Today</h3>
              <p>{summary.personalTotals.today.toLocaleString()} steps</p>
            </div>
            <div className="card card-streak">
              <h3>Current streak</h3>
              <p>
                {summary.streak.currentDays} day
                {summary.streak.currentDays === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="card card-consistency">
            <div
              className="progress-ring"
              style={{ ["--value" as string]: summary.consistency.score }}
              aria-label={`Consistency: ${summary.consistency.score}%, ${summary.consistency.activeDays} of ${summary.consistency.elapsedDays} days active`}
            >
              <div className="progress-ring-inner">
                {summary.consistency.score}%
              </div>
            </div>
            <div className="progress-ring-content">
              <strong>Consistency</strong>
              <span>
                {summary.consistency.activeDays} of {summary.consistency.elapsedDays} days active
              </span>
            </div>
          </div>
          <div className="card">
            <h3>This week</h3>
            <p>{summary.personalTotals.week.toLocaleString()} steps</p>
          </div>
          <div className="card">
            <h3>This month</h3>
            <p>{summary.personalTotals.month.toLocaleString()} steps</p>
          </div>
          <div className="card">
            <h3>Team total</h3>
            <p>
              {summary.teamTotals.teamName || "Unassigned"} ·{" "}
              {summary.teamTotals.total.toLocaleString()} steps
            </p>
          </div>
          <div className="card">
            <h3>Rank</h3>
            <p>{summary.rank ?? "—"}</p>
          </div>
          <div className="card">
            <h3>Gap to #1</h3>
            <p>{summary.gapToFirst.toLocaleString()} steps</p>
          </div>
        </div>
      ) : (
        <div className="empty-state" role="status">
          <p className="status">No summary yet. Submit your first steps to get started!</p>
          <Link to="/submit" className="cta-primary" style={{ display: "inline-block" }}>
            Log your steps
          </Link>
        </div>
      )}
      <div className="notification-prefs">
        <label>
          <input type="checkbox" checked={dailyReminder} onChange={toggleDailyReminder} />
          Daily reminder to log steps
        </label>
      </div>
    </section>
  );
}
