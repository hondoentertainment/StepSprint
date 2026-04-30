import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import type { User } from "../types";
import type { Challenge } from "../types";
import { TABS } from "../types";
import { StepSprintLogo } from "./StepSprintLogo";

type Props = {
  user: User;
  challenges: Challenge[];
  selectedChallengeId: string;
  onChallengeChange: (id: string) => void;
  onLogout: () => void;
  challengesLoading: boolean;
};

export function Layout({
  user,
  challenges,
  selectedChallengeId,
  onChallengeChange,
  onLogout,
  challengesLoading,
}: Props) {
  const visibleTabs = TABS.filter((t) => t !== "Admin" || user.role === "ADMIN");
  const location = useLocation();
  const isOnSubmit = location.pathname === "/submit";

  const tabToPath: Record<string, string> = {
    Home: "/home",
    Submit: "/submit",
    "Leaderboard": "/weekly",
    "Teams": "/teams",
    Admin: "/admin",
  };

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="topbar" role="banner" aria-label="Site header">
        <div className="topbar-brand">
          <StepSprintLogo size={26} />
          <div>
            <h1>StepSprint</h1>
            <p>Welcome, {user.name ?? user.email}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {!isOnSubmit && selectedChallengeId && (
            <Link to="/submit" className="topbar-log-btn" aria-label="Log today's steps">
              + Log steps
            </Link>
          )}
          <select
            value={selectedChallengeId}
            onChange={(e) => onChallengeChange(e.target.value)}
            disabled={challengesLoading || challenges.length === 0}
            aria-label="Select challenge"
          >
            {!challenges.length && <option value="">No challenges available</option>}
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={onLogout} className="secondary">
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Main navigation">
        {visibleTabs.map((label) => (
          <NavLink
            key={label}
            to={tabToPath[label]}
            className={({ isActive }) => (isActive ? "active" : "")}
            data-testid={`tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
