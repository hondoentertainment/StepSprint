import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./App.css";
import { useAuth } from "./hooks/useAuth";
import { useChallenges } from "./hooks/useChallenges";
import { WeekProvider } from "./contexts/WeekContext";
import { useWeek } from "./contexts/useWeek";
import { Login } from "./components/Login";
import { Layout } from "./components/Layout";
import { Home } from "./components/Home";
import { Submit } from "./components/Submit";

// Route-based code splitting: lazy-load heavier, less critical-path routes.
// Home, Login, and Submit stay eager as they're on the primary user journey.
// Auth-utility pages (ForgotPassword, ResetPassword, InvitePage) are lazy
// because they're rarely visited and not needed on first paint.
const ForgotPassword = lazy(() =>
  import("./components/ForgotPassword").then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import("./components/ResetPassword").then((m) => ({ default: m.ResetPassword })),
);
const InvitePage = lazy(() =>
  import("./components/InvitePage").then((m) => ({ default: m.InvitePage })),
);
const WeeklyLeaderboard = lazy(() =>
  import("./components/WeeklyLeaderboard").then((m) => ({ default: m.WeeklyLeaderboard })),
);
const TeamStandings = lazy(() =>
  import("./components/TeamStandings").then((m) => ({ default: m.TeamStandings })),
);
const Admin = lazy(() =>
  import("./components/Admin").then((m) => ({ default: m.Admin })),
);

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="panel" role="status" aria-live="polite">
      {t("common.loading")}
    </div>
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
  const { week } = useWeek();

  if (!user) return null;

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
            <Suspense fallback={<RouteFallback />}>
              <WeeklyLeaderboard challengeId={selectedChallengeId} selectedChallenge={selectedChallenge} />
            </Suspense>
          }
        />
        <Route
          path="teams"
          element={
            <Suspense fallback={<RouteFallback />}>
              <TeamStandings challengeId={selectedChallengeId} user={user} />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            user.role !== "ADMIN" ? (
              <Navigate to="/home" replace />
            ) : (
              <Suspense fallback={<RouteFallback />}>
                <Admin
                  user={user}
                  selectedChallengeId={selectedChallengeId}
                  selectedChallenge={selectedChallenge}
                  onChallengesRefresh={refreshChallenges}
                  weekYear={week.year}
                  weekNumber={week.week}
                />
              </Suspense>
            )
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  const { t } = useTranslation();
  const { user, setUser, isLoading, login, register } = useAuth();

  if (isLoading) {
    return (
      <div className="app">
        <section className="panel">
          <h2>{t("app.loading")}<span className="loading-dots" /></h2>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Suspense fallback={<div className="panel" role="status">{t("common.loading")}</div>}>
          <Routes>
            <Route path="/invite" element={<InvitePage onAccepted={(u) => setUser(u)} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Login onLogin={login} onRegister={register} />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <WeekProvider>
        <AuthenticatedApp />
      </WeekProvider>
    </BrowserRouter>
  );
}

export default App;
