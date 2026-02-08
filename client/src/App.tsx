import { useEffect, useMemo, useState } from "react";
import "./App.css";

type User = {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "PARTICIPANT";
};

type Challenge = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  teamSize: number;
  locked: boolean;
};

type Summary = {
  personalTotals: { today: number; week: number; month: number };
  teamTotals: { teamName: string; total: number };
  rank: number | null;
  gapToFirst: number;
};

type WeeklyEntry = {
  userId: string;
  name: string;
  email: string;
  steps: number;
  trend: "up" | "down" | "same";
};

type TeamEntry = {
  teamId: string;
  teamName: string;
  totalSteps: number;
  avgSteps: number;
  leaderName: string;
  leaderSteps: number;
  stepsBehind: number;
};

type Submission = {
  id: string;
  date: string;
  steps: number;
  isFlagged: boolean;
  user: { email: string; name?: string | null };
  challenge: { name: string };
};

const tabs = ["Home", "Submit", "Weekly Top Steppers", "Team Standings", "Admin"] as const;

async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

function getISOWeek(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: temp.getUTCFullYear(), week: weekNo };
}

function App() {
  const initialWeek = useMemo(() => getISOWeek(new Date()), []);
  const [user, setUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Home");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [weekly, setWeekly] = useState<WeeklyEntry[]>([]);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [submitDate, setSubmitDate] = useState("");
  const [submitSteps, setSubmitSteps] = useState(8000);
  const [adminCreate, setAdminCreate] = useState({
    name: "",
    startDate: "",
    endDate: "",
    timezone: "America/Chicago",
    teamSize: 4,
  });
  const [participantEmails, setParticipantEmails] = useState("");
  const [assignStrategy, setAssignStrategy] = useState<"random" | "snake">("random");
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSubmissions, setAdminSubmissions] = useState<Submission[]>([]);
  const [adminReason, setAdminReason] = useState("");
  const [adminEditSteps, setAdminEditSteps] = useState<number | "">("");
  const [weekYear, setWeekYear] = useState(initialWeek.year);
  const [weekNumber, setWeekNumber] = useState(initialWeek.week);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    api<{ challenges: Challenge[] }>("/api/challenges")
      .then((data) => {
        setChallenges(data.challenges);
        if (!selectedChallengeId && data.challenges.length) {
          setSelectedChallengeId(data.challenges[0].id);
        }
      })
      .catch(() => null);

    api<{ challenge: Challenge | null }>("/api/challenges/active")
      .then((data) => {
        if (data.challenge) {
          setSelectedChallengeId(data.challenge.id);
        }
      })
      .catch(() => null);
  }, [selectedChallengeId]);

  const selectedChallenge = useMemo(
    () => challenges.find((challenge) => challenge.id === selectedChallengeId) ?? null,
    [challenges, selectedChallengeId]
  );

  useEffect(() => {
    if (!selectedChallengeId || !user) return;
    if (tab === "Home") {
      api<Summary>(`/api/me/summary?challengeId=${selectedChallengeId}`).then(setSummary);
    }
    if (tab === "Weekly Top Steppers") {
      api<{ leaderboard: WeeklyEntry[] }>(
        `/api/leaderboards/weekly?challengeId=${selectedChallengeId}&weekYear=${weekYear}&weekNumber=${weekNumber}`
      ).then((data) => setWeekly(data.leaderboard));
    }
    if (tab === "Team Standings") {
      api<{ leaderboard: TeamEntry[] }>(
        `/api/leaderboards/teams?challengeId=${selectedChallengeId}`
      ).then((data) => setTeams(data.leaderboard));
    }
  }, [selectedChallengeId, tab, user, weekNumber, weekYear]);

  useEffect(() => {
    if (tab === "Admin" && user?.role === "ADMIN") {
      api<{ submissions: Submission[] }>(`/api/admin/submissions?query=${adminSearch}`)
        .then((data) => setAdminSubmissions(data.submissions))
        .catch(() => null);
    }
  }, [tab, adminSearch, user]);

  async function handleLogin() {
    const data = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: loginEmail, name: loginName || undefined }),
    });
    setUser(data.user);
  }

  async function handleLogout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  async function handleSubmit() {
    if (!selectedChallengeId) return;
    await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        challengeId: selectedChallengeId,
        date: submitDate,
        steps: Number(submitSteps),
      }),
    });
    setSubmitSteps(8000);
    setSubmitDate("");
    if (tab === "Home") {
      setSummary(await api<Summary>(`/api/me/summary?challengeId=${selectedChallengeId}`));
    }
  }

  async function handleCreateChallenge() {
    await api("/api/admin/challenges", {
      method: "POST",
      body: JSON.stringify(adminCreate),
    });
    const data = await api<{ challenges: Challenge[] }>("/api/challenges");
    setChallenges(data.challenges);
  }

  async function handleAddParticipants() {
    if (!selectedChallengeId) return;
    const emails = participantEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    await api(`/api/admin/challenges/${selectedChallengeId}/participants`, {
      method: "POST",
      body: JSON.stringify({ emails }),
    });
    setParticipantEmails("");
  }

  async function handleAssignTeams() {
    if (!selectedChallengeId) return;
    await api(`/api/admin/challenges/${selectedChallengeId}/assign-teams`, {
      method: "POST",
      body: JSON.stringify({ strategy: assignStrategy }),
    });
  }

  async function handleLockChallenge(locked: boolean) {
    if (!selectedChallengeId) return;
    await api(`/api/admin/challenges/${selectedChallengeId}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ locked }),
    });
  }

  async function handleEditSubmission(submissionId: string) {
    if (!adminReason) return;
    await api(`/api/admin/submissions/${submissionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        steps: adminEditSteps === "" ? undefined : Number(adminEditSteps),
        reason: adminReason,
      }),
    });
    setAdminReason("");
    setAdminEditSteps("");
    if (tab === "Admin") {
      const data = await api<{ submissions: Submission[] }>(
        `/api/admin/submissions?query=${adminSearch}`
      );
      setAdminSubmissions(data.submissions);
    }
  }

  async function handleDeleteSubmission(submissionId: string) {
    if (!adminReason) return;
    await api(`/api/admin/submissions/${submissionId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: adminReason }),
    });
    setAdminReason("");
    if (tab === "Admin") {
      const data = await api<{ submissions: Submission[] }>(
        `/api/admin/submissions?query=${adminSearch}`
      );
      setAdminSubmissions(data.submissions);
    }
  }

  if (!user) {
    return (
      <div className="app">
        <header className="hero">
          <h1>StepSprint</h1>
          <p>Track your team steps and climb the leaderboard.</p>
        </header>
        <section className="panel">
          <h2>Sign in</h2>
          <label>
            Email
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
          </label>
          <label>
            Name (optional)
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} />
          </label>
          <button onClick={handleLogin} disabled={!loginEmail}>
            Continue
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>StepSprint</h1>
          <p>Welcome, {user.name ?? user.email}</p>
        </div>
        <div className="topbar-actions">
          <select
            value={selectedChallengeId}
            onChange={(event) => setSelectedChallengeId(event.target.value)}
          >
            {challenges.map((challenge) => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.name}
              </option>
            ))}
          </select>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((label) => (
          <button key={label} className={tab === label ? "active" : ""} onClick={() => setTab(label)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "Home" && (
        <section className="panel">
          <h2>Participant Home</h2>
          {selectedChallenge && (
            <p>
              {selectedChallenge.name} · {selectedChallenge.timezone} ·{" "}
              {selectedChallenge.locked ? "Locked" : "Open"}
            </p>
          )}
          {summary ? (
            <div className="grid">
              <div className="card">
                <h3>Today</h3>
                <p>{summary.personalTotals.today.toLocaleString()} steps</p>
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
            <p>No summary yet. Submit your first steps!</p>
          )}
        </section>
      )}

      {tab === "Submit" && (
        <section className="panel">
          <h2>Submit steps</h2>
          <label>
            Date
            <input type="date" value={submitDate} onChange={(event) => setSubmitDate(event.target.value)} />
          </label>
          <label>
            Steps
            <input
              type="number"
              value={submitSteps}
              onChange={(event) => setSubmitSteps(Number(event.target.value))}
            />
          </label>
          <button onClick={handleSubmit} disabled={!submitDate || !selectedChallengeId}>
            Submit
          </button>
          <p className="hint">Submissions above 100,000 steps are flagged.</p>
        </section>
      )}

      {tab === "Weekly Top Steppers" && (
        <section className="panel">
          <h2>Weekly Top Steppers</h2>
          <div className="row">
            <label>
              Week year
              <input
                type="number"
                value={weekYear}
                onChange={(event) => setWeekYear(Number(event.target.value))}
              />
            </label>
            <label>
              Week number
              <input
                type="number"
                value={weekNumber}
                onChange={(event) => setWeekNumber(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="list">
            {weekly.map((entry, index) => (
              <div key={entry.userId} className="list-row">
                <div>
                  #{index + 1} {entry.name || entry.email}
                </div>
                <div>
                  {entry.steps.toLocaleString()} steps · trend {entry.trend}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "Team Standings" && (
        <section className="panel">
          <h2>Team Leaderboard</h2>
          <div className="list">
            {teams.map((entry, index) => (
              <div key={entry.teamId} className="list-row">
                <div>
                  #{index + 1} {entry.teamName}
                </div>
                <div>
                  {entry.totalSteps.toLocaleString()} total · Leader {entry.leaderName} (
                  {entry.leaderSteps.toLocaleString()}) · Avg {entry.avgSteps.toLocaleString()} ·{" "}
                  {entry.stepsBehind.toLocaleString()} behind
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "Admin" && (
        <section className="panel">
          <h2>Admin console</h2>
          {user.role !== "ADMIN" ? (
            <p>You do not have admin access.</p>
          ) : (
            <div className="admin-grid">
              <div>
                <h3>Challenge setup</h3>
                <label>
                  Name
                  <input
                    value={adminCreate.name}
                    onChange={(event) => setAdminCreate({ ...adminCreate, name: event.target.value })}
                  />
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={adminCreate.startDate}
                    onChange={(event) =>
                      setAdminCreate({ ...adminCreate, startDate: event.target.value })
                    }
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={adminCreate.endDate}
                    onChange={(event) =>
                      setAdminCreate({ ...adminCreate, endDate: event.target.value })
                    }
                  />
                </label>
                <label>
                  Timezone
                  <input
                    value={adminCreate.timezone}
                    onChange={(event) =>
                      setAdminCreate({ ...adminCreate, timezone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Team size
                  <input
                    type="number"
                    value={adminCreate.teamSize}
                    onChange={(event) =>
                      setAdminCreate({ ...adminCreate, teamSize: Number(event.target.value) })
                    }
                  />
                </label>
                <button onClick={handleCreateChallenge}>Create challenge</button>
              </div>

              <div>
                <h3>Participants</h3>
                <label>
                  Emails (comma separated)
                  <textarea
                    value={participantEmails}
                    onChange={(event) => setParticipantEmails(event.target.value)}
                  />
                </label>
                <button onClick={handleAddParticipants}>Add participants</button>
                <h3>Team assignment</h3>
                <label>
                  Strategy
                  <select
                    value={assignStrategy}
                    onChange={(event) => setAssignStrategy(event.target.value as "random" | "snake")}
                  >
                    <option value="random">Random</option>
                    <option value="snake">Snake draft</option>
                  </select>
                </label>
                <button onClick={handleAssignTeams}>Assign teams</button>
                <div className="row">
                  <button onClick={() => handleLockChallenge(true)}>Lock challenge</button>
                  <button onClick={() => handleLockChallenge(false)}>Unlock challenge</button>
                </div>
              </div>

              <div>
                <h3>Moderation</h3>
                <label>
                  Search
                  <input
                    value={adminSearch}
                    onChange={(event) => setAdminSearch(event.target.value)}
                  />
                </label>
                <label>
                  Reason (required)
                  <input
                    value={adminReason}
                    onChange={(event) => setAdminReason(event.target.value)}
                  />
                </label>
                <label>
                  Edit steps (optional)
                  <input
                    type="number"
                    value={adminEditSteps}
                    onChange={(event) =>
                      setAdminEditSteps(event.target.value === "" ? "" : Number(event.target.value))
                    }
                  />
                </label>
                <div className="list">
                  {adminSubmissions.map((submission) => (
                    <div key={submission.id} className="list-row">
                      <div>
                        {submission.user.name ?? submission.user.email} ·{" "}
                        {submission.date.slice(0, 10)} · {submission.steps} steps{" "}
                        {submission.isFlagged ? "(flagged)" : ""}
                      </div>
                      <div className="row">
                        <button onClick={() => handleEditSubmission(submission.id)}>Edit</button>
                        <button onClick={() => handleDeleteSubmission(submission.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>Exports</h3>
                <div className="list">
                  <a href={`/api/admin/export/submissions?challengeId=${selectedChallengeId}`}>
                    Export submissions CSV
                  </a>
                  <a href={`/api/admin/export/teams?challengeId=${selectedChallengeId}`}>
                    Export team leaderboard CSV
                  </a>
                  <a
                    href={`/api/admin/export/weekly?challengeId=${selectedChallengeId}&weekYear=${weekYear}&weekNumber=${weekNumber}`}
                  >
                    Export weekly leaderboard CSV
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
