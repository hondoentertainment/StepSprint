import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { User } from "../types";
import type { Challenge } from "../types";
import { TABS } from "../types";
import { StepSprintLogo } from "./StepSprintLogo";
import { LanguageSwitcher } from "./LanguageSwitcher";

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
  const { t } = useTranslation();
  const visibleTabs = TABS.filter((t) => t !== "Admin" || user.role === "ADMIN");
  const location = useLocation();
  const isOnSubmit = location.pathname === "/submit";

  const tabToPath: Record<string, string> = {
    Home: "/home",
    Submit: "/submit",
    Devices: "/integrations",
    "Leaderboard": "/weekly",
    "Teams": "/teams",
    Admin: "/admin",
  };

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        {t("common.skipToContent")}
      </a>
      <header className="topbar" role="banner" aria-label={t("layout.siteHeaderAria")}>
        <div className="topbar-brand">
          <StepSprintLogo size={26} />
          <div>
            <h1>{t("app.name")}</h1>
            <p>{t("layout.welcome", { name: user.name ?? user.email })}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {!isOnSubmit && selectedChallengeId && (
            <Link to="/submit" className="topbar-log-btn" aria-label={t("layout.logStepsShortcutAria")}>
              {t("layout.logStepsShortcut")}
            </Link>
          )}
          <select
            value={selectedChallengeId}
            onChange={(e) => onChallengeChange(e.target.value)}
            disabled={challengesLoading || challenges.length === 0}
            aria-label={t("layout.selectChallenge")}
          >
            {!challenges.length && (
              <option value="">{t("layout.noChallenges")}</option>
            )}
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={onLogout} className="secondary">
            {t("layout.logout")}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t("layout.mainNavAria")}>
        {visibleTabs.map((label) => (
          <NavLink
            key={label}
            to={tabToPath[label]}
            className={({ isActive }) => (isActive ? "active" : "")}
            data-testid={`tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {t(`layout.tabs.${label}`)}
          </NavLink>
        ))}
      </nav>

      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <LanguageSwitcher />
    </div>
  );
}
