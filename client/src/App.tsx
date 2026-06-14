import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import { useAuth } from "./hooks/useAuth";
import { useChallenges } from "./hooks/useChallenges";
import { WeekProvider, useWeek } from "./contexts/WeekContext";
import { Login } from "./components/Login";
import { ForgotPassword } from "./components/ForgotPassword";
import { ResetPassword } from "./components/ResetPassword";
import { InvitePage } from "./components/InvitePage";
import { Layout } from "./components/Layout";
import { Home } from "./components/Home";
import { Submit } from "./components/Submit";
import { WeeklyLeaderboard } from "./components/WeeklyLeaderboard";
import { TeamStandings } from "./components/TeamStandings";
import { Admin } from "./components/Admin";
import type { User, Challenge } from "./types";

function AuthenticatedAppRoutes({
  user,
  logout,
  challenges,
  selectedChallengeId,
  setSelectedChallengeId,
  selectedChallenge,
  challengesLoading,
  challengesError,
  refreshChallenges,
}: {
  user: User;
  logout: () => void;
  challenges: Challenge[];
  selectedChallengeId: string;
  setSelectedChallengeId: (id: string) => void;
  selectedChallenge: Challenge | null;
  challengesLoading: boolean;
  challengesError: string;
  refreshChallenges: () => Promise<Challenge[]>;
}) {
  const { week } = useWeek();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout
            user={user}
            challenges={challenges}
            selectedChallengeId={selectedChallengeId}
            onChallengeChange={setSelectedChallengeId}
            onLogout={logout}
            challengesLoading={challengesLoading}
          />
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route
          path="home"
          element={
            <Home
              challengeId={selectedChallengeId}
              selectedChallenge={selectedChallenge}
              challengesLoading={challengesLoading}
              challengesError={challengesError}
            />
          }
        />
        <Route
          path="submit"
          element={
            <Submit
              challengeId={selectedChallengeId}
              selectedChallenge={selectedChallenge}
              challengesLoading={challengesLoading}
            />
          }
        />
        <Route
          path="weekly"
          element={
            <WeeklyLeaderboard challengeId={selectedChallengeId} selectedChallenge={selectedChallenge} />
          }
        />
        <Route path="teams" element={<TeamStandings challengeId={selectedChallengeId} user={user} />} />
        <Route
          path="admin"
          element={
            user.role !== "ADMIN" ? (
              <Navigate to="/home" replace />
            ) : (
              <Admin
                user={user}
                challenges={challenges}
                selectedChallengeId={selectedChallengeId}
                selectedChallenge={selectedChallenge}
                onChallengesRefresh={refreshChallenges}
                weekYear={week.year}
                weekNumber={week.week}
              />
            )
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const {
    challenges,
    selectedChallengeId,
    setSelectedChallengeId,
    selectedChallenge,
    isLoading: challengesLoading,
    error: challengesError,
    refreshChallenges,
  } = useChallenges();

  if (!user) return null;

  return (
    <WeekProvider timezone={selectedChallenge?.timezone}>
      <AuthenticatedAppRoutes
        user={user}
        logout={logout}
        challenges={challenges}
        selectedChallengeId={selectedChallengeId}
        setSelectedChallengeId={setSelectedChallengeId}
        selectedChallenge={selectedChallenge}
        challengesLoading={challengesLoading}
        challengesError={challengesError}
        refreshChallenges={refreshChallenges}
      />
    </WeekProvider>
  );
}

function App() {
  const { user, setUser, isLoading, login, register } = useAuth();

  if (isLoading) {
    return (
      <div className="app">
        <section className="panel">
          <h2>Loading<span className="loading-dots" /></h2>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/invite" element={<InvitePage onAccepted={(u) => setUser(u)} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Login onLogin={login} onRegister={register} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <AuthenticatedApp />
    </BrowserRouter>
  );
}

export default App;
