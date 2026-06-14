import { useEffect, useState } from "react";
import { api } from "../api";
import { getErrorMessage } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import type { User } from "../types";
import type { Challenge } from "../types";
import type { Submission } from "../types";

type Props = {
  user: User;
  challenges: Challenge[];
  selectedChallengeId: string;
  selectedChallenge: Challenge | null;
  onChallengesRefresh: () => Promise<Challenge[]>;
  weekYear: number;
  weekNumber: number;
};

export function Admin({
  user,
  challenges: _challenges,
  selectedChallengeId,
  selectedChallenge,
  onChallengesRefresh,
  weekYear,
  weekNumber,
}: Props) {
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
  const [analytics, setAnalytics] = useState<{
    participationRate: number;
    avgActiveDays: number;
    totalSubmissions: number;
    totalSteps: number;
  } | null>(null);

  useEffect(() => {
    if (user.role !== "ADMIN") return;
    const url = `/api/admin/submissions?query=${encodeURIComponent(search)}${selectedChallengeId ? `&challengeId=${selectedChallengeId}` : ""}`;
    api<{ submissions: Submission[] }>(url)
      .then((data) => setSubmissions(data.submissions))
      .catch(() => setSubmissions([]));
  }, [user.role, search, selectedChallengeId]);

  useEffect(() => {
    if (user.role !== "ADMIN" || !selectedChallengeId) return;
    api<{ participationRate: number; avgActiveDays: number; totalSubmissions: number; totalSteps: number }>(
      `/api/admin/analytics?challengeId=${selectedChallengeId}`
    )
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [user.role, selectedChallengeId]);

  async function handleCreateInvite() {
    if (!selectedChallengeId || !inviteEmail) {
      showFeedback("error", "Select a challenge and enter email.");
      return;
    }
    try {
      const data = await api<{ inviteUrl: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ challengeId: selectedChallengeId, email: inviteEmail }),
      });
      setInviteUrl(data.inviteUrl);
      showFeedback("success", "Invite link created. Share it with the participant.");
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function handleCreateChallenge() {
    try {
      await api("/api/admin/challenges", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      await onChallengesRefresh();
      setCreateForm({ name: "", startDate: "", endDate: "", timezone: "America/Chicago", teamSize: 4 });
      showFeedback("success", "Challenge created.");
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleAddParticipants() {
    if (!selectedChallengeId) {
      showFeedback("error", "Select a challenge first.");
      return;
    }
    try {
      const emails = participantEmails.split(",").map((e) => e.trim()).filter(Boolean);
      await api(`/api/admin/challenges/${selectedChallengeId}/participants`, {
        method: "POST",
        body: JSON.stringify({ emails }),
      });
      setParticipantEmails("");
      showFeedback("success", `Added ${emails.length} participant(s).`);
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleAssignTeams() {
    if (!selectedChallengeId) {
      showFeedback("error", "Select a challenge first.");
      return;
    }
    try {
      await api(`/api/admin/challenges/${selectedChallengeId}/assign-teams`, {
        method: "POST",
        body: JSON.stringify({ strategy: assignStrategy }),
      });
      showFeedback("success", "Teams assigned.");
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  async function handleLockChallenge(locked: boolean) {
    if (!selectedChallengeId) {
      showFeedback("error", "Select a challenge first.");
      return;
    }
    try {
      await api(`/api/admin/challenges/${selectedChallengeId}/lock`, {
        method: "PATCH",
        body: JSON.stringify({ locked }),
      });
      await onChallengesRefresh();
      showFeedback("success", locked ? "Challenge locked." : "Challenge unlocked.");
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
      showFeedback("success", "Submission updated.");
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
      showFeedback("success", "Submission deleted.");
    } catch (err) {
      showFeedback("error", getErrorMessage(err));
    }
  }

  if (user.role !== "ADMIN") {
    return (
      <section className="panel">
        <h2>Admin console</h2>
        <p>You do not have admin access.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Admin console</h2>
      {selectedChallenge && (
        <span className={`challenge-badge ${selectedChallenge.locked ? "locked" : "open"}`}>
          {selectedChallenge.name} · Scoped to this challenge
        </span>
      )}
      {feedback && (
        <p className={`status status-${feedback.type}`} role="status" aria-live="polite">
          {feedback.message}
        </p>
      )}

      <div className="admin-grid">
        <div>
          <h3>Challenge setup</h3>
          <label>Name <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} /></label>
          <label>Start date <input type="date" value={createForm.startDate} onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })} /></label>
          <label>End date <input type="date" value={createForm.endDate} onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })} /></label>
          <label>Timezone <input value={createForm.timezone} onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })} /></label>
          <label>Team size <input type="number" value={createForm.teamSize} onChange={(e) => setCreateForm({ ...createForm, teamSize: Number(e.target.value) })} /></label>
          <button onClick={handleCreateChallenge}>Create challenge</button>
        </div>

        <div>
          <h3>Participants <span className="admin-scope">({selectedChallengeId ? selectedChallenge?.name ?? "Challenge" : "Select a challenge"})</span></h3>
          <label>Emails (comma separated)<textarea value={participantEmails} onChange={(e) => setParticipantEmails(e.target.value)} /></label>
          <button onClick={handleAddParticipants} disabled={!selectedChallengeId}>Add participants</button>
          <h3>Team assignment</h3>
          <label>Strategy <select value={assignStrategy} onChange={(e) => setAssignStrategy(e.target.value as "random" | "snake")}><option value="random">Random</option><option value="snake">Snake draft</option></select></label>
          <button onClick={() => handleAssignTeams()} disabled={!selectedChallengeId}>Assign teams</button>
          <div className="row">
            <button onClick={() => handleLockChallenge(true)} className="secondary" disabled={!selectedChallengeId}>Lock challenge</button>
            <button onClick={() => handleLockChallenge(false)} className="secondary" disabled={!selectedChallengeId}>Unlock challenge</button>
          </div>
        </div>

        <div>
          <h3>Moderation <span className="admin-scope">({selectedChallengeId ? "this challenge" : "all"})</span></h3>
          <label>Search <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="email or name" /></label>
          <label>Reason (required) <input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label>Edit steps (optional) <input type="number" value={editSteps} onChange={(e) => setEditSteps(e.target.value === "" ? "" : Number(e.target.value))} /></label>
          <div className="list">
            {submissions.map((sub) => (
              <div key={sub.id} className="list-row">
                <div>
                  {sub.user.name ?? sub.user.email} · {sub.date.slice(0, 10)} · {sub.steps} steps {sub.isFlagged ? "(flagged)" : ""}
                </div>
                <div className="row">
                  <button
                    onClick={() => reason && setConfirmTarget({ action: "edit", submission: sub })}
                    disabled={!reason}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => reason && setConfirmTarget({ action: "delete", submission: sub })}
                    disabled={!reason}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Invite participant</h3>
          <label>Email <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="participant@example.com" /></label>
          <button onClick={handleCreateInvite} disabled={!selectedChallengeId || !inviteEmail}>Create invite link</button>
          {inviteUrl && (
            <div className="invite-url">
              <label>Share this link:</label>
              <input type="text" readOnly value={inviteUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
          )}

          <h3>Analytics</h3>
          {analytics && selectedChallengeId ? (
            <div className="analytics-stats">
              <span>Participation: {analytics.participationRate}%</span>
              <span>Avg active days: {analytics.avgActiveDays}</span>
              <span>Total submissions: {analytics.totalSubmissions}</span>
              <span>Total steps: {analytics.totalSteps.toLocaleString()}</span>
            </div>
          ) : (
            <p className="hint">Select a challenge to view analytics.</p>
          )}

          <h3>Exports</h3>
          <p className="hint">CSV exports open in a new tab. You must be logged in; your session cookie is sent automatically.</p>
          <div className="list">
            <a href={`/api/admin/export/submissions?challengeId=${selectedChallengeId || ""}`} target="_blank" rel="noreferrer">Export submissions CSV</a>
            <a href={`/api/admin/export/teams?challengeId=${selectedChallengeId || ""}`} target="_blank" rel="noreferrer">Export team leaderboard CSV</a>
            <a href={`/api/admin/export/weekly?challengeId=${selectedChallengeId || ""}&weekYear=${weekYear}&weekNumber=${weekNumber}`} target="_blank" rel="noreferrer">Export weekly leaderboard CSV</a>
          </div>
        </div>
      </div>
      {confirmTarget && (
        <ConfirmDialog
          open={!!confirmTarget}
          title={confirmTarget.action === "delete" ? "Delete submission?" : "Edit submission?"}
          message={
            confirmTarget.action === "delete"
              ? `Are you sure you want to delete this submission? (${confirmTarget.submission.user.name ?? confirmTarget.submission.user.email} · ${confirmTarget.submission.date.slice(0, 10)} · ${confirmTarget.submission.steps} steps) This cannot be undone.`
              : `Edit steps for ${confirmTarget.submission.user.name ?? confirmTarget.submission.user.email} on ${confirmTarget.submission.date.slice(0, 10)}?`
          }
          confirmLabel={confirmTarget.action === "delete" ? "Delete" : "Save"}
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
