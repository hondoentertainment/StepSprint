import { NavLink, Outlet } from "react-router-dom";
import type { User } from "../types";
import type { Challenge } from "../types";
import { TABS } from "../types";

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

  const pathToTab: Record<string, string> = {
    "/": "Home",
    "/home": "Home",
    "/submit": "Submit",
    "/weekly": "Weekly Top Steppers",
    "/teams": "Team Standings",
    "/admin": "Admin",
  };

  const tabToPath: Record<string, string> = {
    Home: "/home",
    Submit: "/submit",
    "Weekly Top Steppers": "/weekly",
    "Team Standings": "/teams",
    Admin: "/admin",
  };

  return (
    <div className="app">
      <header className="topbar" role="banner">
        <div>
          <h1>Schafer Shufflers</h1>
          <p>Welcome, {user.name ?? user.email}</p>
        </div>
        <div className="topbar-actions">
          <select
            value={selectedChallengeId}
            onChange={(e) => onChallengeChange(e.target.value)}
            disabled={challengesLoading || challenges.length === 0}
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

      <main>
        <Outlet />
      </main>
    </div>
  );
}
