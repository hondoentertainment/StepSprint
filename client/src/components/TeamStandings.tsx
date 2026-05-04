import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.resolvedLanguage ?? undefined;
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
      <h2>{t("teamStandings.title")}</h2>
      {error && <p className="status status-error">{error}</p>}
      {isLoading ? (
        <div className="loading-skeleton">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <p className="status">{t("teamStandings.loading")}</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="empty-state" role="status">
          <p className="status">
            {user?.role === "ADMIN"
              ? t("teamStandings.emptyAdmin")
              : t("teamStandings.emptyParticipant")}
          </p>
          <Link
            to={user?.role === "ADMIN" ? "/admin" : "/submit"}
            className={user?.role === "ADMIN" ? "secondary" : "cta-primary"}
            style={{ display: "inline-block" }}
          >
            {user?.role === "ADMIN" ? t("teamStandings.goToAdmin") : t("teamStandings.logSteps")}
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
                <span className="rank">#{index + 1}</span>
                <span className="list-name" title={entry.teamName}>{entry.teamName}</span>
                {userTeamName && entry.teamName === userTeamName && (
                  <span className="my-team-badge" aria-hidden> {t("teamStandings.myTeam")}</span>
                )}
              </div>
              <div className="meta">
                <span className="meta-steps">{entry.totalSteps.toLocaleString(numberLocale)} {t("common.steps")}</span>
                <span className="meta-detail">
                  {entry.leaderName || t("common.notApplicable")} {t("teamStandings.leads")} &middot; {entry.stepsBehind.toLocaleString(numberLocale)} {t("teamStandings.behindShort")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
