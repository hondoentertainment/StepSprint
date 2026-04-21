import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getErrorMessage } from "../api";
import type { TeamEntry } from "../types";
import type { Summary } from "../types";
import type { User } from "../types";

type Props = {
  challengeId: string;
  user?: User | null;
};

export function TeamStandings({ challengeId, user }: Props) {
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [userTeamName, setUserTeamName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!challengeId) return;

    let cancelled = false;

    async function loadTeams() {
      setIsLoading(true);
      setError("");
      try {
        const data = await api<{ leaderboard: TeamEntry[] }>(
          `/api/leaderboards/teams?challengeId=${challengeId}`
        );
        if (cancelled) return;
        setTeams(data.leaderboard);
      } catch (err) {
        if (cancelled) return;
        setTeams([]);
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  useEffect(() => {
    if (!challengeId) return;

    let cancelled = false;

    async function loadSummary() {
      try {
        const data = await api<Summary>(`/api/me/summary?challengeId=${challengeId}`);
        if (cancelled) return;
        setUserTeamName(data.teamTotals.teamName || null);
      } catch {
        if (cancelled) return;
        setUserTeamName(null);
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  return (
    <section className="panel">
      <h2>Team Leaderboard</h2>
      {error && <p className="status status-error">{error}</p>}
      {isLoading ? (
        <div className="loading-skeleton">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <p className="status">Loading team standings...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="empty-state" role="status">
          <p className="status">
            {user?.role === "ADMIN"
              ? "No team standings yet. Add participants and assign teams to get started."
              : "No team standings yet. Log steps to contribute, or ask your admin to assign teams."}
          </p>
          <Link
            to={user?.role === "ADMIN" ? "/admin" : "/submit"}
            className={user?.role === "ADMIN" ? "secondary" : "cta-primary"}
            style={{ display: "inline-block" }}
          >
            {user?.role === "ADMIN" ? "Go to Admin" : "Log steps"}
          </Link>
        </div>
      ) : (
        <div className="list">
          {teams.map((entry, index) => (
            <div
              key={entry.teamId}
              className={`list-row ${userTeamName && entry.teamName === userTeamName ? "list-row-my-team" : ""}`}
            >
              <div className="primary">
                <span className="rank">#{index + 1}</span> {entry.teamName}
                {userTeamName && entry.teamName === userTeamName && (
                  <span className="my-team-badge" aria-hidden> (your team)</span>
                )}
              </div>
              <div className="meta">
                {entry.totalSteps.toLocaleString()} total · Lead: {entry.leaderName || "—"} (
                {entry.leaderSteps.toLocaleString()}) · {entry.stepsBehind.toLocaleString()} behind
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
