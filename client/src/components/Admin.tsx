import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getApiUrl, getErrorMessage } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import type { User } from "../types";
import type { Challenge } from "../types";
import type { Submission } from "../types";

type CohortRow = {
  challengeId: string;
  challengeName: string;
  startDate: string;
  endDate: string;
  timezone: string;
  lifecycle: "upcoming" | "active" | "ended";
  participantCount: number;
  participationRate: number;
  neverLoggedCount: number;
  dormantParticipantCount: number;
  avgActiveDays: number;
  totalSubmissions: number;
  totalSteps: number;
};

type Props = {
  user: User;
  selectedChallengeId: string;
  selectedChallenge: Challenge | null;
  onChallengesRefresh: () => Promise<Challenge[]>;
  weekYear: number;
  weekNumber: number;
};

export function Admin({
  user,
  selectedChallengeId,
  selectedChallenge,
  onChallengesRefresh,
  weekYear,
  weekNumber,
}: Props) {
  const { t } = useTranslation();
  const [createForm, setCreateForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    timezone: "America/Chicago",
    teamSize: 4,
  });
  const [participantEmails, setParticipantEmails] = useState("");
  const [assignStrategy, setAssignStrategy] = useState<"random" | "snake">("random");
  const [search, setSearch] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reason, setReason] = useState("");
  const [editSteps, setEditSteps] = useState<number | "">("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ action: "edit" | "delete"; submission: Submission } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopyOk, setInviteCopyOk] = useState(false);
  const [analytics, setAnalytics] = useState<{
    participationRate: number;
    participantsWithSubmission: number;
    participantCount: number;
    avgActiveDays: number;
    totalSubmissions: number;
    totalSteps: number;
    neverLoggedCount: number;
    dormantParticipantCount: number;
    dormantLookbackDays: number;
    submissionTrend: Array<{ date: string; submissionsCount: number }>;
  } | null>(null);

  const [cohortRows, setCohortRows] = useState<CohortRow[] | null>(null);

  const loadCohort = useCallback(() => {
    if (user.role !== "ADMIN") return;
    api<{ challenges: CohortRow[] }>("/api/admin/analytics/cohort")
      .then((data) => setCohortRows(data.challenges))
      .catch(() => setCohortRows([]));
  }, [user.role]);

  useEffect(() => {
    if (user.role !== "ADMIN") return;
    const url = `/api/admin/submissions?query=${encodeURIComponent(search)}${selectedChallengeId ? `&challengeId=${selectedChallengeId}` : ""}`;
    api<{ submissions: Submission[] }>(url)
      .then((data) => setSubmissions(data.submissions))
      .catch(() => setSubmissions([]));
  }, [user.role, search, selectedChallengeId]);

  useEffect(() => {
    if (user.role !== "ADMIN" || !selectedChallengeId) return;
    api<{
      participationRate: number;
      participantsWithSubmission: number;
      participantCount: number;
      avgActiveDays: number;
      totalSubmissions: number;
      totalSteps: number;
      neverLoggedCount: number;
      dormantParticipantCount: number;
      dormantLookbackDays: number;
      submissionTrend: Array<{ date: string; submissionsCount: number }>;
    }>(`/api/admin/analytics?challengeId=${selectedChallengeId}`)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [user.role, selectedChallengeId]);

  useEffect(() => {
    loadCohort();
  }, [loadCohort]);

  async function handleCreateInvite() {
    if (!selectedChallengeId || !inviteEmail) {
      showFeedback("error", t("admin.feedback.selectChallengeAndEmail"));
      return;
    }
    try {
      const data = await api<{ inviteUrl: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ challengeId: selectedChallengeId, email: inviteEmail }),
      });
      setInviteUrl(data.inviteUrl);
      setInviteCopyOk(false);
      showFeedback("success", t("admin.feedback.inviteCreated"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopyOk(true);
      setTimeout(() => setInviteCopyOk(false), 2500);
    } catch {
      showFeedback("error", t("admin.invite.clipboardUnavailable"));
    }
  }

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  const trendMax =
    analytics && analytics.submissionTrend.length > 0
      ? Math.max(...analytics.submissionTrend.map((r) => r.submissionsCount), 1)
      : 1;

  async function handleCreateChallenge() {
    try {
      await api("/api/admin/challenges", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      await onChallengesRefresh();
      setCreateForm({ name: "", startDate: "", endDate: "", timezone: "America/Chicago", teamSize: 4 });
      loadCohort();
      showFeedback("success", t("admin.feedback.challengeCreated"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleAddParticipants() {
    if (!selectedChallengeId) {
      showFeedback("error", t("admin.feedback.selectChallenge"));
      return;
    }
    try {
      const emails = participantEmails.split(",").map((e) => e.trim()).filter(Boolean);
      await api(`/api/admin/challenges/${selectedChallengeId}/participants`, {
        method: "POST",
        body: JSON.stringify({ emails }),
      });
      setParticipantEmails("");
      loadCohort();
      showFeedback("success", t("admin.feedback.participantsAdded", { count: emails.length }));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleAssignTeams() {
    if (!selectedChallengeId) {
      showFeedback("error", t("admin.feedback.selectChallenge"));
      return;
    }
    try {
      await api(`/api/admin/challenges/${selectedChallengeId}/assign-teams`, {
        method: "POST",
        body: JSON.stringify({ strategy: assignStrategy }),
      });
      loadCohort();
      showFeedback("success", t("admin.feedback.teamsAssigned"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleLockChallenge(locked: boolean) {
    if (!selectedChallengeId) {
      showFeedback("error", t("admin.feedback.selectChallenge"));
      return;
    }
    try {
      await api(`/api/admin/challenges/${selectedChallengeId}/lock`, {
        method: "PATCH",
        body: JSON.stringify({ locked }),
      });
      await onChallengesRefresh();
      loadCohort();
      showFeedback("success", locked ? t("admin.feedback.challengeLocked") : t("admin.feedback.challengeUnlocked"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function executeEditSubmission(submissionId: string) {
    try {
      await api(`/api/admin/submissions/${submissionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          steps: editSteps === "" ? undefined : Number(editSteps),
          reason,
        }),
      });
      setReason("");
      setEditSteps("");
      setConfirmTarget(null);
      const url = `/api/admin/submissions?query=${encodeURIComponent(search)}${selectedChallengeId ? `&challengeId=${selectedChallengeId}` : ""}`;
      const data = await api<{ submissions: Submission[] }>(url);
      setSubmissions(data.submissions);
      showFeedback("success", t("admin.feedback.submissionUpdated"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function executeDeleteSubmission(submissionId: string) {
    try {
      await api(`/api/admin/submissions/${submissionId}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      setReason("");
      setConfirmTarget(null);
      const url = `/api/admin/submissions?query=${encodeURIComponent(search)}${selectedChallengeId ? `&challengeId=${selectedChallengeId}` : ""}`;
      const data = await api<{ submissions: Submission[] }>(url);
      setSubmissions(data.submissions);
      showFeedback("success", t("admin.feedback.submissionDeleted"));
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  if (user.role !== "ADMIN") {
    return (
      <section className="panel">
        <h2>{t("admin.title")}</h2>
        <p>{t("admin.noAccess")}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{t("admin.title")}</h2>
      {selectedChallenge && (
        <span className={`challenge-badge ${selectedChallenge.locked ? "locked" : "open"}`}>
          {selectedChallenge.name} · {t("admin.scopedTo")}
        </span>
      )}
      {feedback && (
        <p className={`status status-${feedback.type}`} role="status" aria-live="polite">
          {feedback.message}
        </p>
      )}

      <div className="admin-grid">
        <div>
          <h3>{t("admin.sections.challengeSetup")}</h3>
          <label>{t("admin.fields.name")} <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} /></label>
          <label>{t("admin.fields.startDate")} <input type="date" value={createForm.startDate} onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })} /></label>
          <label>{t("admin.fields.endDate")} <input type="date" value={createForm.endDate} onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })} /></label>
          <label>{t("admin.fields.timezone")} <input value={createForm.timezone} onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })} /></label>
          <label>{t("admin.fields.teamSize")} <input type="number" value={createForm.teamSize} onChange={(e) => setCreateForm({ ...createForm, teamSize: Number(e.target.value) })} /></label>
          <button onClick={handleCreateChallenge}>{t("admin.actions.createChallenge")}</button>
        </div>

        <div>
          <h3>
            {t("admin.sections.participants")}{" "}
            <span className="admin-scope">
              ({selectedChallengeId ? selectedChallenge?.name ?? t("admin.scope.selectPrompt") : t("admin.scope.selectPrompt")})
            </span>
          </h3>
          <label>{t("admin.fields.emails")}<textarea value={participantEmails} onChange={(e) => setParticipantEmails(e.target.value)} /></label>
          <button onClick={handleAddParticipants} disabled={!selectedChallengeId}>{t("admin.actions.addParticipants")}</button>
          <h3>{t("admin.sections.teamAssignment")}</h3>
          <label>
            {t("admin.fields.strategy")}{" "}
            <select value={assignStrategy} onChange={(e) => setAssignStrategy(e.target.value as "random" | "snake")}>
              <option value="random">{t("admin.strategies.random")}</option>
              <option value="snake">{t("admin.strategies.snake")}</option>
            </select>
          </label>
          <button onClick={() => handleAssignTeams()} disabled={!selectedChallengeId}>{t("admin.actions.assignTeams")}</button>
          <div className="row">
            <button onClick={() => handleLockChallenge(true)} className="secondary" disabled={!selectedChallengeId}>{t("admin.actions.lockChallenge")}</button>
            <button onClick={() => handleLockChallenge(false)} className="secondary" disabled={!selectedChallengeId}>{t("admin.actions.unlockChallenge")}</button>
          </div>
        </div>

        <div>
          <h3>
            {t("admin.sections.moderation")}{" "}
            <span className="admin-scope">
              ({selectedChallengeId ? t("admin.scope.thisChallenge") : t("admin.scope.all")})
            </span>
          </h3>
          <label>{t("admin.fields.search")} <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.fields.searchPlaceholder")} /></label>
          <label>{t("admin.fields.reason")} <input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label>{t("admin.fields.editSteps")} <input type="number" value={editSteps} onChange={(e) => setEditSteps(e.target.value === "" ? "" : Number(e.target.value))} /></label>
          <div className="list">
            {submissions.map((sub) => (
              <div key={sub.id} className="list-row">
                <div>
                  {sub.user.name ?? sub.user.email} · {sub.date.slice(0, 10)} · {sub.steps} {t("common.steps")}{" "}
                  {sub.isFlagged ? t("admin.submission.flagged") : ""}
                </div>
                <div className="row">
                  <button
                    onClick={() => reason && setConfirmTarget({ action: "edit", submission: sub })}
                    disabled={!reason}
                  >
                    {t("admin.actions.edit")}
                  </button>
                  <button
                    onClick={() => reason && setConfirmTarget({ action: "delete", submission: sub })}
                    disabled={!reason}
                  >
                    {t("admin.actions.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>{t("admin.sections.inviteParticipant")}</h3>
          <label>
            {t("admin.fields.email")}{" "}
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("admin.fields.emailPlaceholder")}
            />
          </label>
          <button onClick={handleCreateInvite} disabled={!selectedChallengeId || !inviteEmail}>
            {t("admin.actions.createInviteLink")}
          </button>
          {inviteUrl && (
            <div className="invite-url">
              <label>{t("admin.invite.shareLink")}</label>
              <div className="invite-url-row">
                <input type="text" readOnly value={inviteUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button type="button" className="secondary" onClick={() => void copyInviteLink()}>
                  {inviteCopyOk ? t("admin.invite.copied") : t("admin.invite.copy")}
                </button>
              </div>
              <p className="hint invite-hint">{t("admin.invite.hintExpiry")}</p>
            </div>
          )}

          <h3>{t("admin.sections.cohort")}</h3>
          <p className="hint">{t("admin.cohort.intro")}</p>
          {cohortRows && cohortRows.length === 0 ? (
            <p className="hint">{t("admin.cohort.empty")}</p>
          ) : cohortRows && cohortRows.length > 0 ? (
            <div className="cohort-table-wrap">
              <table className="cohort-table">
                <thead>
                  <tr>
                    <th scope="col">{t("admin.cohort.headers.challenge")}</th>
                    <th scope="col">{t("admin.cohort.headers.status")}</th>
                    <th scope="col">{t("admin.cohort.headers.participants")}</th>
                    <th scope="col">{t("admin.cohort.headers.participation")}</th>
                    <th scope="col">{t("admin.cohort.headers.dormant")}</th>
                    <th scope="col">{t("admin.cohort.headers.neverLogged")}</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortRows.map((row) => (
                    <tr key={row.challengeId}>
                      <td>{row.challengeName}</td>
                      <td>{t(`admin.cohort.lifecycle.${row.lifecycle}`)}</td>
                      <td>{row.participantCount}</td>
                      <td>{row.participationRate}%</td>
                      <td>{row.dormantParticipantCount}</td>
                      <td>{row.neverLoggedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <h3>{t("admin.sections.analytics")}</h3>
          {analytics && selectedChallengeId ? (
            <div className="analytics-dashboard">
              <div className="analytics-stats">
                <span>{t("admin.analytics.participation", { rate: analytics.participationRate })}</span>
                <span>{t("admin.analytics.avgActiveDays", { days: analytics.avgActiveDays })}</span>
                <span>{t("admin.analytics.totalSubmissions", { count: analytics.totalSubmissions })}</span>
                <span>{t("admin.analytics.totalSteps", { steps: analytics.totalSteps.toLocaleString() })}</span>
                <span>
                  {t("admin.analytics.neverLogged", {
                    never: analytics.neverLoggedCount,
                    total: analytics.participantCount,
                  })}
                </span>
                <span>
                  {t("admin.analytics.dormant", {
                    dormant: analytics.dormantParticipantCount,
                    days: analytics.dormantLookbackDays,
                  })}
                </span>
              </div>
              <p className="analytics-chart-title">{t("admin.analytics.submissionsTrend")}</p>
              <div className="analytics-chart" aria-label={t("admin.analytics.trendAria")}>
                {analytics.submissionTrend.length === 0 ? (
                  <p className="hint analytics-empty">{t("admin.analytics.emptyTrend")}</p>
                ) : (
                  analytics.submissionTrend.map((row) => (
                    <div key={row.date} className="analytics-bar-wrap" title={`${row.date}: ${row.submissionsCount}`}>
                      <div
                        className="analytics-bar"
                        style={{ height: `${Math.max(4, Math.round((row.submissionsCount / trendMax) * 48))}px` }}
                      />
                      <span className="analytics-bar-label">{row.date.slice(5)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="hint">{t("admin.analytics.selectChallenge")}</p>
          )}

          <h3>{t("admin.sections.exports")}</h3>
          <p className="hint">{t("admin.exports.hint")}</p>
          <div className="list export-links">
            {selectedChallengeId ? (
              <>
                <a
                  href={getApiUrl(`/api/admin/export/submissions?challengeId=${encodeURIComponent(selectedChallengeId)}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin.exports.submissions")}
                </a>
                <a
                  href={getApiUrl(`/api/admin/export/teams?challengeId=${encodeURIComponent(selectedChallengeId)}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin.exports.teams")}
                </a>
                <a
                  href={getApiUrl(
                    `/api/admin/export/weekly?challengeId=${encodeURIComponent(selectedChallengeId)}&weekYear=${weekYear}&weekNumber=${weekNumber}`
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin.exports.weekly")}
                </a>
              </>
            ) : (
              <span className="hint">{t("admin.exports.selectChallengeFirstLink")}</span>
            )}
          </div>
        </div>
      </div>
      {confirmTarget && (
        <ConfirmDialog
          open={!!confirmTarget}
          title={confirmTarget.action === "delete" ? t("admin.confirm.deleteTitle") : t("admin.confirm.editTitle")}
          message={
            confirmTarget.action === "delete"
              ? t("admin.confirm.deleteMessage", {
                  user: confirmTarget.submission.user.name ?? confirmTarget.submission.user.email,
                  date: confirmTarget.submission.date.slice(0, 10),
                  steps: confirmTarget.submission.steps,
                })
              : t("admin.confirm.editMessage", {
                  user: confirmTarget.submission.user.name ?? confirmTarget.submission.user.email,
                  date: confirmTarget.submission.date.slice(0, 10),
                })
          }
          confirmLabel={confirmTarget.action === "delete" ? t("admin.confirm.delete") : t("admin.confirm.save")}
          variant={confirmTarget.action === "delete" ? "danger" : "default"}
          onConfirm={() => {
            if (confirmTarget.action === "edit") executeEditSubmission(confirmTarget.submission.id);
            else executeDeleteSubmission(confirmTarget.submission.id);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </section>
  );
}
