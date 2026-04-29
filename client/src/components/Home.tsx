import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ApiError, getErrorMessage } from "../api";
import { track } from "../analytics";
import type { Challenge } from "../types";
import type { Summary } from "../types";

type Props = {
  challengeId: string;
  selectedChallenge: Challenge | null;
  challengesLoading: boolean;
  challengesError: string;
};

/**
 * Convert the server's URL-safe base64 VAPID public key into the raw byte
 * array that `pushManager.subscribe({ applicationServerKey })` expects.
 * Returns an ArrayBuffer so the result is a plain BufferSource regardless
 * of the DOM lib's stricter Uint8Array generic parameterisation.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

function HomeSkeleton() {
  return (
    <div className="loading-skeleton" aria-label="Loading summary">
      <div className="skeleton skeleton-title" />
      <div className="stats-grid stats-grid-skeleton">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </div>
  );
}

export function Home({
  challengeId,
  selectedChallenge,
  challengesLoading,
  challengesError,
}: Props) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [welcomeMessage] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem("stepSprintJustLoggedIn") !== null;
  });
  const [dailyReminder, setDailyReminder] = useState(false);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushKeyLoaded, setPushKeyLoaded] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    { kind: "success" | "error" | "info"; message: string } | null
  >(null);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (welcomeMessage && typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("stepSprintJustLoggedIn");
    }
    // Only run on mount to clear the one-time flag; subsequent toggles don't retrigger storage clearing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPreferences() {
      try {
        const prefs = await api<{ dailyReminder: boolean }>("/api/me/notifications/preferences");
        if (cancelled) return;
        setDailyReminder(prefs.dailyReminder);
      } catch {
        // ignore; notification preferences are best-effort
      }
    }
    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDailyReminder() {
    const prev = dailyReminder;
    const next = !prev;
    setDailyReminder(next);
    api("/api/me/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ dailyReminder: next }),
    }).catch(() => setDailyReminder(prev));
  }

  useEffect(() => {
    if (!pushSupported) {
      setPushKeyLoaded(true);
      return;
    }
    let cancelled = false;
    async function loadPushKey() {
      try {
        const res = await api<{ key: string | null }>(
          "/api/me/notifications/push/public-key"
        );
        if (cancelled) return;
        setPushKey(res.key);
      } catch {
        if (cancelled) return;
        setPushKey(null);
      } finally {
        if (!cancelled) setPushKeyLoaded(true);
      }
    }
    void loadPushKey();
    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

  async function enablePush() {
    if (!pushKey || !pushSupported) return;
    setPushBusy(true);
    setPushStatus(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus({
          kind: "error",
          message: t("home.notifications.permissionDenied"),
        });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushKey),
      });
      const json = subscription.toJSON();
      await api("/api/me/notifications/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      setPushStatus({
        kind: "success",
        message: t("home.notifications.enabled"),
      });
    } catch (err) {
      setPushStatus({
        kind: "error",
        message: getErrorMessage(err),
      });
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!challengeId) return;

    track("challenge_viewed", { challengeId });

    let cancelled = false;

    async function loadSummary() {
      setIsLoading(true);
      setError("");
      try {
        const data = await api<Summary>(`/api/me/summary?challengeId=${challengeId}`);
        if (cancelled) return;
        setSummary(data);
      } catch (err) {
        if (cancelled) return;
        setSummary(null);
        if (err instanceof ApiError && err.status === 403) {
          setError(t("home.notEnrolled"));
        } else {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [challengeId, t]);

  return (
    <section className="panel">
      <h2>{t("home.title")}</h2>
      {welcomeMessage && (
        <p className="status status-success" role="status" aria-live="polite">
          {t("home.welcome")}
        </p>
      )}
      {challengesError && <p className="status status-error">{challengesError}</p>}
      {selectedChallenge && (
        <span
          className={`challenge-badge ${selectedChallenge.locked ? "locked" : "open"}`}
        >
          {selectedChallenge.name} · {selectedChallenge.timezone} ·{" "}
          {selectedChallenge.locked ? t("common.locked") : t("common.open")}
        </span>
      )}
      {challengesLoading ? (
        <HomeSkeleton />
      ) : !challengeId ? (
        <p className="status">{t("home.noChallenges")}</p>
      ) : isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        <p className="status status-error">{error}</p>
      ) : summary ? (
        <div className="stats-grid">
          <div className="stats-hero">
            <div className="card card-hero">
              <h3>{t("home.stats.today")}</h3>
              <p>{summary.personalTotals.today.toLocaleString()} {t("common.steps")}</p>
            </div>
            <div className="card card-streak">
              <h3>{t("home.stats.streak")}</h3>
              <p>
                {t("home.stats.days", { count: summary.streak.currentDays })}
              </p>
            </div>
          </div>
          <div className="card card-consistency">
            <div
              className="progress-ring"
              style={{ ["--value" as string]: summary.consistency.score }}
              aria-label={`${t("home.stats.consistency")}: ${summary.consistency.score}%, ${t("home.stats.daysActive", { active: summary.consistency.activeDays, elapsed: summary.consistency.elapsedDays })}`}
            >
              <div className="progress-ring-inner">
                {summary.consistency.score}%
              </div>
            </div>
            <div className="progress-ring-content">
              <strong>{t("home.stats.consistency")}</strong>
              <span>
                {t("home.stats.daysActive", {
                  active: summary.consistency.activeDays,
                  elapsed: summary.consistency.elapsedDays,
                })}
              </span>
            </div>
          </div>
          <div className="card">
            <h3>{t("home.stats.thisWeek")}</h3>
            <p>{summary.personalTotals.week.toLocaleString()} {t("common.steps")}</p>
          </div>
          <div className="card">
            <h3>{t("home.stats.thisMonth")}</h3>
            <p>{summary.personalTotals.month.toLocaleString()} {t("common.steps")}</p>
          </div>
          <div className="card">
            <h3>{t("home.stats.teamTotal")}</h3>
            <p>
              {summary.teamTotals.teamName || t("common.unassigned")} ·{" "}
              {summary.teamTotals.total.toLocaleString()} {t("common.steps")}
            </p>
          </div>
          <div className="card">
            <h3>{t("home.stats.rank")}</h3>
            <p>{summary.rank ?? "—"}</p>
          </div>
          <div className="card">
            <h3>{t("home.stats.gapToFirst")}</h3>
            <p>{summary.gapToFirst.toLocaleString()} {t("common.steps")}</p>
          </div>
        </div>
      ) : (
        <div className="empty-state" role="status">
          <p className="status">{t("home.emptyState")}</p>
          <Link to="/submit" className="cta-primary" style={{ display: "inline-block" }}>
            {t("home.logSteps")}
          </Link>
        </div>
      )}
      <div className="notification-prefs">
        <label>
          <input type="checkbox" checked={dailyReminder} onChange={toggleDailyReminder} />
          {t("home.notifications.dailyReminder")}
        </label>
        {pushKeyLoaded && (!pushSupported || pushKey === null) ? (
          <p className="status">{t("home.notifications.notAvailable")}</p>
        ) : pushKeyLoaded ? (
          <div>
            <button
              type="button"
              onClick={enablePush}
              disabled={pushBusy}
              className="cta-secondary"
            >
              {pushBusy ? t("home.notifications.enabling") : t("home.notifications.enable")}
            </button>
            {pushStatus && (
              <p
                className={
                  pushStatus.kind === "error"
                    ? "status status-error"
                    : pushStatus.kind === "success"
                      ? "status status-success"
                      : "status"
                }
                role="status"
                aria-live="polite"
              >
                {pushStatus.message}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
