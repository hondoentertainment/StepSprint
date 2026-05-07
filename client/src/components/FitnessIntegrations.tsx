import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError, getErrorMessage, getApiUrl } from "../api";
import { ANALYTICS_EVENTS, track, trackAppleHealthSyncFirstObserved } from "../analytics";
import { IconFootstep, IconWearable } from "./Icons";
import { todayInTimezone } from "../utils";
import { formatSyncOutcome } from "./syncOutcome";

function buildAppleHealthCurlCommand(
  postUrl: string,
  bearerToken: string,
  challengeId: string,
  dateISO: string,
  steps: number
): string {
  const body = JSON.stringify({ challengeId, date: dateISO, steps });
  return [
    "curl -sS -X POST",
    JSON.stringify(postUrl),
    "-H",
    JSON.stringify(`Authorization: Bearer ${bearerToken}`),
    "-H",
    JSON.stringify("Content-Type: application/json"),
    "--data-raw",
    JSON.stringify(body),
  ].join(" ");
}

type IntegrationToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type FitnessProviderRow = {
  id: string;
  name: string;
  available: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
};

type Props = {
  challengeId: string;
  challengeTimezone?: string;
  challengeStart?: string;
  challengeEnd?: string;
};

function providerUrlSlug(id: string): string {
  return id.replace(/_/g, "-");
}

/** Coerce ISO date or datetime to a YYYY-MM-DD string for `<input type="date" />`. */
function toDateInputValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length >= 10 ? value.slice(0, 10) : value;
}

/** Whole calendar days between two YYYY-MM-DD strings (UTC). Negative if a > b. */
function daysBetween(aISO: string, bISO: string): number {
  const a = Date.UTC(
    Number(aISO.slice(0, 4)),
    Number(aISO.slice(5, 7)) - 1,
    Number(aISO.slice(8, 10))
  );
  const b = Date.UTC(
    Number(bISO.slice(0, 4)),
    Number(bISO.slice(5, 7)) - 1,
    Number(bISO.slice(8, 10))
  );
  return Math.round((b - a) / 86_400_000);
}

/** Mirrors MAX_SYNC_RANGE_DAYS on the server. */
const MAX_BACKFILL_DAYS = 31;

export function FitnessIntegrations({
  challengeId,
  challengeTimezone,
  challengeStart,
  challengeEnd,
}: Props) {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [providers, setProviders] = useState<FitnessProviderRow[]>([]);
  const [overallLinked, setOverallLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [lastAppleHealthSyncAt, setLastAppleHealthSyncAt] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [csvDraft, setCsvDraft] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const syncUrl = getApiUrl("/api/integrations/apple-health");

  const todayISO = useMemo(() => todayInTimezone(challengeTimezone), [challengeTimezone]);
  const challengeMinISO = useMemo(() => toDateInputValue(challengeStart), [challengeStart]);
  const challengeEndISO = useMemo(() => toDateInputValue(challengeEnd), [challengeEnd]);
  const maxSyncDateISO = useMemo(() => {
    if (challengeEndISO && challengeEndISO < todayISO) return challengeEndISO;
    return todayISO;
  }, [challengeEndISO, todayISO]);

  const [syncDate, setSyncDate] = useState<string>(todayISO);
  type SyncMode = "single" | "last7" | "last30";
  const [syncMode, setSyncMode] = useState<SyncMode>("single");

  useEffect(() => {
    setSyncDate((current) => {
      if (current && challengeMinISO && current < challengeMinISO) return challengeMinISO;
      if (current && current > maxSyncDateISO) return maxSyncDateISO;
      if (!current) return todayISO;
      return current;
    });
  }, [challengeId, challengeMinISO, maxSyncDateISO, todayISO]);

  const isSyncDateValid =
    !!syncDate &&
    syncDate <= maxSyncDateISO &&
    (!challengeMinISO || syncDate >= challengeMinISO);

  const isToday = syncDate === todayISO;
  const formattedSyncDate = useMemo(() => {
    if (!syncDate) return "";
    const parts = syncDate.split("-");
    if (parts.length !== 3) return syncDate;
    const [y, m, d] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [syncDate]);

  /** Drop N days from a YYYY-MM-DD string. */
  function shiftDays(iso: string, deltaDays: number): string {
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Compute the inclusive [start, end] window for the current mode,
   * clamped to the challenge bounds. Returns null when no valid window.
   */
  const syncWindow = useMemo<{ startDate: string; endDate: string; days: number } | null>(() => {
    let endISO: string;
    let startISO: string;
    if (syncMode === "single") {
      if (!isSyncDateValid) return null;
      endISO = syncDate;
      startISO = syncDate;
    } else {
      const span = syncMode === "last7" ? 7 : 30;
      endISO = maxSyncDateISO;
      startISO = shiftDays(endISO, -(span - 1));
      if (challengeMinISO && startISO < challengeMinISO) startISO = challengeMinISO;
    }
    if (startISO > endISO) return null;
    const days =
      Math.round(
        (Date.UTC(
          Number(endISO.slice(0, 4)),
          Number(endISO.slice(5, 7)) - 1,
          Number(endISO.slice(8, 10))
        ) -
          Date.UTC(
            Number(startISO.slice(0, 4)),
            Number(startISO.slice(5, 7)) - 1,
            Number(startISO.slice(8, 10))
          )) /
          86_400_000
      ) + 1;
    return { startDate: startISO, endDate: endISO, days };
  }, [syncMode, syncDate, isSyncDateValid, maxSyncDateISO, challengeMinISO]);

  const appleProvider = useMemo(
    () => providers.find((p) => p.id === "apple_health"),
    [providers],
  );
  const oauthProviders = useMemo(
    () => providers.filter((p) => p.id !== "apple_health"),
    [providers],
  );

  const csvPlaceholder = useMemo(
    () =>
      JSON.stringify(
        {
          challengeId,
          rows: [{ date: "YYYY-MM-DD", steps: 8000 }],
        },
        null,
        2
      ),
    [challengeId],
  );

  const appleHealthCurlCommand = useMemo(() => {
    const token = newToken ?? t("integrations.appleHealth.curlPlaceholderToken");
    const dateISO = syncDate || todayISO;
    return buildAppleHealthCurlCommand(syncUrl, token, challengeId, dateISO, 1000);
  }, [newToken, syncUrl, challengeId, syncDate, todayISO, t]);

  useEffect(() => {
    setCsvDraft(csvPlaceholder);
  }, [csvPlaceholder]);

  const loadData = useCallback(async () => {
    try {
      const [tokenData, fitnessData] = await Promise.all([
        api<{ tokens: IntegrationToken[] }>("/api/integrations/tokens"),
        api<{
          connected: boolean;
          lastAppleHealthSyncAt: string | null;
          providers: FitnessProviderRow[];
        }>(`/api/integrations/fitness?challengeId=${encodeURIComponent(challengeId)}`),
      ]);
      setTokens(tokenData.tokens);
      const rows = fitnessData.providers.map((p) => ({
        ...p,
        connectedAt: p.connectedAt ?? null,
        lastSyncedAt: p.lastSyncedAt ?? null,
      }));
      setProviders(rows);
      setOverallLinked(Boolean(fitnessData.connected));
      setLastAppleHealthSyncAt(fitnessData.lastAppleHealthSyncAt ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (lastAppleHealthSyncAt && challengeId) {
      trackAppleHealthSyncFirstObserved(challengeId);
    }
  }, [lastAppleHealthSyncAt, challengeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api(`/api/me/summary?challengeId=${encodeURIComponent(challengeId)}`);
        if (!cancelled) setNotEnrolled(false);
      } catch (err) {
        if (cancelled) return;
        setNotEnrolled(err instanceof ApiError && err.status === 403);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");
    if (oauthSuccess || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth_success");
      url.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", url.toString());
      if (oauthSuccess) {
        track(ANALYTICS_EVENTS.integrationOauthReturned, { provider: oauthSuccess, outcome: "success" });
        void loadData();
      }
      if (oauthError) {
        track(ANALYTICS_EVENTS.integrationOauthReturned, { outcome: "error", error_code: oauthError });
        setError(t("integrations.oauthError", { error: oauthError }));
      }
    }
  }, [loadData, t]);

  async function createToken() {
    try {
      setCreating(true);
      setError("");
      setNewToken(null);
      setSyncResult(null);
      const data = await api<{ token: string; label: string }>("/api/integrations/tokens", {
        method: "POST",
        body: JSON.stringify({ label: t("integrations.appleHealth.tokenLabelDefault") }),
      });
      setNewToken(data.token);
      track(ANALYTICS_EVENTS.integrationTokenCreated, { challengeId });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    try {
      setRevoking(id);
      setError("");
      setSyncResult(null);
      await api(`/api/integrations/tokens/${id}`, { method: "DELETE" });
      track(ANALYTICS_EVENTS.integrationTokenRevoked, { challengeId });
      if (newToken) setNewToken(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevoking(null);
    }
  }

  async function disconnectProvider(provider: FitnessProviderRow) {
    try {
      setDisconnecting(provider.id);
      setError("");
      setSyncResult(null);
      await api(`/api/integrations/${providerUrlSlug(provider.id)}/disconnect`, {
        method: "DELETE",
      });
      track(ANALYTICS_EVENTS.integrationOauthDisconnected, {
        provider: provider.id,
        challengeId,
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDisconnecting(null);
    }
  }

  /**
   * Backfill from the day after the provider's last successful sync up to
   * today, capped at MAX_BACKFILL_DAYS. Bypasses the mode pills so it works
   * regardless of what the user currently has selected.
   */
  async function backfillSince(provider: FitnessProviderRow, lastIso: string) {
    try {
      setSyncing(provider.id);
      setError("");
      setSyncResult(null);

      const dayAfterLast = (() => {
        const next = daysBetween("1970-01-01", lastIso) + 1;
        const ms = next * 86_400_000;
        const d = new Date(ms);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      })();

      let startDate = dayAfterLast;
      if (challengeMinISO && startDate < challengeMinISO) startDate = challengeMinISO;
      const endDate = maxSyncDateISO;
      if (startDate > endDate) {
        setSyncResult(t("integrations.oauth.backfillNothingToDo", { name: provider.name }));
        return;
      }
      // Cap the window so we never exceed the server-side limit.
      const cappedStart = (() => {
        const span = daysBetween(startDate, endDate) + 1;
        if (span <= MAX_BACKFILL_DAYS) return startDate;
        return shiftDays(endDate, -(MAX_BACKFILL_DAYS - 1));
      })();

      const result = await api<{
        imported: number;
        updated: number;
        skipped: number;
      }>(`/api/integrations/${providerUrlSlug(provider.id)}/sync`, {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          startDate: cappedStart,
          endDate,
        }),
      });

      const days = daysBetween(cappedStart, endDate) + 1;
      setSyncResult(formatSyncOutcome(t, provider.name, result, days));
      track(ANALYTICS_EVENTS.integrationOauthSync, {
        provider: provider.id,
        challengeId,
        mode: "backfillSinceLast",
        startDate: cappedStart,
        endDate,
        days,
        backfill: true,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncing(null);
    }
  }

  async function syncProvider(provider: FitnessProviderRow) {
    try {
      setSyncing(provider.id);
      setError("");
      setSyncResult(null);
      const window = syncWindow;
      const isRange = syncMode !== "single";
      const body: Record<string, unknown> = { challengeId };
      if (isRange && window) {
        body.startDate = window.startDate;
        body.endDate = window.endDate;
      } else {
        body.date = isSyncDateValid ? syncDate : todayISO;
      }
      const result = await api<{
        imported: number;
        updated: number;
        skipped: number;
      }>(`/api/integrations/${providerUrlSlug(provider.id)}/sync`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSyncResult(
        formatSyncOutcome(
          t,
          provider.name,
          result,
          isRange && window ? window.days : null,
        ),
      );
      track(ANALYTICS_EVENTS.integrationOauthSync, {
        provider: provider.id,
        challengeId,
        mode: syncMode,
        ...(isRange && window
          ? { startDate: window.startDate, endDate: window.endDate, days: window.days }
          : { date: body.date }),
        backfill: isRange || body.date !== todayISO,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncing(null);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function copyCurlToClipboard() {
    try {
      await navigator.clipboard.writeText(appleHealthCurlCommand);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function connectUrl(provider: FitnessProviderRow) {
    return getApiUrl(
      `/api/integrations/${providerUrlSlug(provider.id)}/connect?challengeId=${encodeURIComponent(challengeId)}`
    );
  }

  async function importCsv() {
    try {
      setCsvBusy(true);
      setError("");
      setSyncResult(null);
      let parsed: { challengeId?: string; rows?: Array<{ date: string; steps: number }> };
      try {
        parsed = JSON.parse(csvDraft) as typeof parsed;
      } catch {
        setError(t("integrations.csv.invalidJson"));
        return;
      }
      const { challengeId: bodyChallengeId, rows } = parsed;
      if (!bodyChallengeId || !Array.isArray(rows) || rows.length === 0) {
        setError(t("integrations.csv.invalidShape"));
        return;
      }
      if (bodyChallengeId !== challengeId) {
        setError(t("integrations.csv.challengeMismatch"));
        return;
      }
      const result = await api<{ imported: number; updated: number; skipped: number }>("/api/integrations/csv", {
        method: "POST",
        body: JSON.stringify({ challengeId: bodyChallengeId, rows }),
      });
      setSyncResult(
        t("integrations.csv.success", {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
        })
      );
      track(ANALYTICS_EVENTS.integrationCsvImported, {
        challengeId,
        rowCount: rows.length,
        imported: result.imported,
        updated: result.updated,
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCsvBusy(false);
    }
  }

  if (loading) return <p className="hint">{t("common.loading")}</p>;

  return (
    <div className="integration-hub">
      <div
        className={`integration-summary ${overallLinked ? "integration-summary--ok" : "integration-summary--neutral"}`}
        role="region"
        aria-label={t("integrations.summaryStripAria")}
      >
        <p className="integration-summary__text">
          {overallLinked ? t("integrations.summaryLinked") : t("integrations.summaryNotLinked")}
        </p>
        <Link to="/submit" className="integration-summary__link">
          {t("integrations.summaryManualLink")}
        </Link>
      </div>

      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {syncResult && (
        <p className="status status-success" role="status">
          {syncResult}
        </p>
      )}
      {notEnrolled && (
        <p className="status status-error" role="alert">
          {t("integrations.notEnrolledInChallenge")}
        </p>
      )}

      <article className="integration-card integration-card--apple apple-health-sync">
        <header className="integration-card__header">
          <span className="integration-card__icon" aria-hidden="true">
            <IconWearable size={26} />
          </span>
          <div className="integration-card__header-text">
            <h3>{t("integrations.appleHealth.sectionTitle")}</h3>
            <span
              className={`integration-badge ${appleProvider?.connected ? "integration-badge--ok" : ""}`}
            >
              {appleProvider?.connected ? t("integrations.badge.linked") : t("integrations.badge.notLinked")}
            </span>
          </div>
        </header>

        <p className="hint">{t("integrations.appleHealth.introOptional")}</p>
        <p className="hint">{t("integrations.appleHealth.introShortcut")}</p>
        {challengeTimezone && (
          <p className="hint" role="note">
            {t("integrations.appleHealth.challengeTimezoneHint", { timezone: challengeTimezone })}
          </p>
        )}
        <p className="hint">{t("integrations.appleHealth.batchBackfillHint")}</p>
        {lastAppleHealthSyncAt && (
          <p className="hint" role="status">
            {t("integrations.appleHealth.lastSyncToChallenge", {
              datetime: new Date(lastAppleHealthSyncAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        )}

        {newToken && (
          <div className="token-reveal panel">
            <p className="status status-success">{t("integrations.appleHealth.tokenCreated")}</p>
            <code className="token-value" aria-label={t("integrations.appleHealth.tokenAriaLabel")}>
              {newToken}
            </code>
            <button type="button" className="secondary" onClick={() => void copyToClipboard(newToken)}>
              {copied ? t("integrations.appleHealth.copied") : t("integrations.appleHealth.copyToken")}
            </button>

            <details className="shortcut-guide">
              <summary>{t("integrations.appleHealth.shortcutGuideSummary")}</summary>
              <ol>
                <li>{t("integrations.appleHealth.shortcutStep1")}</li>
                <li>{t("integrations.appleHealth.shortcutStep2")}</li>
                <li>{t("integrations.appleHealth.shortcutStep3")}</li>
                <li>{t("integrations.appleHealth.shortcutStep4")}</li>
                <li>
                  {t("integrations.appleHealth.shortcutStep5Title")}
                  <ul>
                    <li>
                      {t("integrations.appleHealth.shortcutStep5Url")} <code>{syncUrl}</code>
                    </li>
                    <li>{t("integrations.appleHealth.shortcutStep5Method")}</li>
                    <li>{t("integrations.appleHealth.shortcutStep5Header", { token: newToken })}</li>
                    <li>{t("integrations.appleHealth.shortcutStep5HeaderJson")}</li>
                    <li>
                      {t("integrations.appleHealth.shortcutStep5Body")}
                      <pre className="shortcut-json">
                        {t("integrations.appleHealth.shortcutStep5Json", { challengeId })}
                      </pre>
                    </li>
                  </ul>
                </li>
                <li>{t("integrations.appleHealth.shortcutStep6")}</li>
              </ol>
            </details>
          </div>
        )}

        <div className="token-list">
          <h4>{t("integrations.appleHealth.apiTokensHeading")}</h4>
          {tokens.length === 0 ? (
            <p className="hint">{t("integrations.appleHealth.noTokensYet")}</p>
          ) : (
            <ul>
              {tokens.map((tokenRow) => (
                <li key={tokenRow.id} className="token-row">
                  <span className="token-label">{tokenRow.label}</span>
                  <span className="token-meta">
                    {t("integrations.appleHealth.createdOn", {
                      date: new Date(tokenRow.createdAt).toLocaleDateString(),
                    })}
                    {tokenRow.lastUsedAt && (
                      <>
                        {" \u00b7 "}
                        {t("integrations.appleHealth.lastUsedOn", {
                          date: new Date(tokenRow.lastUsedAt).toLocaleDateString(),
                        })}
                      </>
                    )}
                    {tokenRow.expiresAt && (
                      <>
                        {" \u00b7 "}
                        {t("integrations.appleHealth.expiresOn", {
                          date: new Date(tokenRow.expiresAt).toLocaleDateString(),
                        })}
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => void revokeToken(tokenRow.id)}
                    disabled={revoking === tokenRow.id}
                    aria-label={t("integrations.appleHealth.revokeAriaLabel", { label: tokenRow.label })}
                  >
                    {revoking === tokenRow.id
                      ? t("integrations.appleHealth.revoking")
                      : t("integrations.appleHealth.revoke")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="secondary" onClick={() => void createToken()} disabled={creating}>
            {creating ? t("integrations.appleHealth.generating") : t("integrations.appleHealth.generateToken")}
          </button>
        </div>

        {(tokens.length > 0 || newToken) && (
          <details className="shortcut-guide">
            <summary>{t("integrations.appleHealth.curlTestSummary")}</summary>
            <p className="hint">{t("integrations.appleHealth.curlTestIntro")}</p>
            <pre className="shortcut-json">{appleHealthCurlCommand}</pre>
            <button type="button" className="secondary" onClick={() => void copyCurlToClipboard()}>
              {curlCopied ? t("integrations.appleHealth.curlCopied") : t("integrations.appleHealth.curlCopy")}
            </button>
          </details>
        )}

        {!newToken && tokens.length > 0 && (
          <details className="shortcut-guide">
            <summary>{t("integrations.appleHealth.apiReferenceSummary")}</summary>
            <p>{t("integrations.appleHealth.apiReferenceIntro", { url: syncUrl })}</p>
            <pre className="shortcut-json">
              {t("integrations.appleHealth.apiReferenceExample", { challengeId })}
            </pre>
          </details>
        )}
      </article>

      <section className="integration-csv-panel" aria-labelledby="integrations-csv-heading">
        <article className="integration-card integration-card--csv">
          <h4 className="integration-csv-heading" id="integrations-csv-heading">
            {t("integrations.csv.sectionTitle")}
          </h4>
          <p className="hint">{t("integrations.csv.intro")}</p>
          <label htmlFor="integration-csv-json" className="sr-only">
            {t("integrations.csv.textareaLabel")}
          </label>
          <textarea
            id="integration-csv-json"
            className="integration-csv-textarea"
            value={csvDraft}
            onChange={(e) => setCsvDraft(e.target.value)}
            spellCheck={false}
            rows={8}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => void importCsv()}
            disabled={csvBusy || notEnrolled}
          >
            {csvBusy ? t("integrations.csv.submitting") : t("integrations.csv.submit")}
          </button>
          <details className="shortcut-guide integration-csv-hint-details">
            <summary>{t("integrations.csv.constraintsSummary")}</summary>
            <p className="hint">{t("integrations.csv.constraintsBody")}</p>
          </details>
        </article>
      </section>

      <section className="integration-trackers oauth-providers" aria-labelledby="integrations-trackers-heading">
        <h3 id="integrations-trackers-heading">{t("integrations.trackersSectionTitle")}</h3>
        <p className="hint">{t("integrations.trackersSectionHint")}</p>

        <div className="integration-sync-date">
          <span className="integration-sync-date__label" id="integration-sync-mode-label">
            {t("integrations.syncDate.modeLabel")}
          </span>
          <div
            className="integration-sync-date__pills"
            role="radiogroup"
            aria-labelledby="integration-sync-mode-label"
          >
            <button
              type="button"
              role="radio"
              aria-checked={syncMode === "single"}
              className={`integration-sync-pill${syncMode === "single" ? " integration-sync-pill--active" : ""}`}
              onClick={() => setSyncMode("single")}
            >
              {t("integrations.syncDate.modeSingle")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={syncMode === "last7"}
              className={`integration-sync-pill${syncMode === "last7" ? " integration-sync-pill--active" : ""}`}
              onClick={() => setSyncMode("last7")}
            >
              {t("integrations.syncDate.modeLast7")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={syncMode === "last30"}
              className={`integration-sync-pill${syncMode === "last30" ? " integration-sync-pill--active" : ""}`}
              onClick={() => setSyncMode("last30")}
            >
              {t("integrations.syncDate.modeLast30")}
            </button>
          </div>

          {syncMode === "single" ? (
            <>
              <label htmlFor="integration-sync-date-input" className="integration-sync-date__label">
                {t("integrations.syncDate.label")}
              </label>
              <div className="integration-sync-date__controls">
                <input
                  id="integration-sync-date-input"
                  type="date"
                  value={syncDate}
                  min={challengeMinISO}
                  max={maxSyncDateISO}
                  onChange={(e) => setSyncDate(e.target.value)}
                  aria-describedby="integration-sync-date-hint"
                />
                {!isToday && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSyncDate(todayISO)}
                  >
                    {t("integrations.syncDate.resetToToday")}
                  </button>
                )}
              </div>
              <p className="hint" id="integration-sync-date-hint">
                {t("integrations.syncDate.hint")}
              </p>
            </>
          ) : (
            <p className="hint" id="integration-sync-date-hint">
              {syncWindow
                ? t("integrations.syncDate.rangeHint", {
                    start: syncWindow.startDate,
                    end: syncWindow.endDate,
                    days: syncWindow.days,
                  })
                : t("integrations.syncDate.rangeHintEmpty")}
            </p>
          )}
        </div>

        <ul className="integration-trackers__grid">
          {oauthProviders.map((p) => (
            <li key={p.id}>
              <article className={`integration-card integration-card--oauth${p.connected ? " integration-card--connected" : ""}`}>
                <header className="integration-card__row">
                  <span className="integration-card__icon integration-card__icon--muted" aria-hidden="true">
                    <IconFootstep size={22} />
                  </span>
                  <div className="integration-card__oauth-title">
                    <h4>{p.name}</h4>
                    {!p.available ? (
                      <span className="integration-badge">{t("integrations.oauth.notConfigured")}</span>
                    ) : p.connected ? (
                      <span className="integration-badge integration-badge--ok">{t("integrations.badge.linked")}</span>
                    ) : (
                      <span className="integration-badge">{t("integrations.badge.notLinked")}</span>
                    )}
                  </div>
                </header>

                {p.connected && p.connectedAt && (
                  <p className="hint integration-card__meta">
                    {t("integrations.oauth.connectedOn", {
                      date: new Date(p.connectedAt).toLocaleDateString(),
                    })}
                  </p>
                )}

                {p.connected && p.lastSyncedAt && (() => {
                  const lastIso = (p.lastSyncedAt as string).slice(0, 10);
                  const gap = daysBetween(lastIso, todayISO);
                  return (
                    <p className="hint integration-card__meta">
                      {t("integrations.oauth.lastSyncedOn", {
                        date: new Date(p.lastSyncedAt as string).toLocaleDateString(),
                      })}
                      {gap >= 1 && (
                        <>
                          {" \u00b7 "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => void backfillSince(p, lastIso)}
                            disabled={syncing === p.id}
                          >
                            {t("integrations.oauth.backfillSinceLast", {
                              days: Math.min(gap, MAX_BACKFILL_DAYS),
                            })}
                          </button>
                        </>
                      )}
                    </p>
                  );
                })()}

                <div className="integration-card__actions">
                  {!p.available ? (
                    <p className="hint integration-card__admin-hint">{t("integrations.oauthAdminHint")}</p>
                  ) : p.connected ? (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void syncProvider(p)}
                        disabled={
                          syncing === p.id ||
                          (syncMode === "single" && !isSyncDateValid) ||
                          (syncMode !== "single" && !syncWindow)
                        }
                      >
                        {syncing === p.id
                          ? t("integrations.oauth.syncing")
                          : syncMode === "last7"
                            ? t("integrations.oauth.syncLastDays", {
                                days: syncWindow?.days ?? 7,
                              })
                            : syncMode === "last30"
                              ? t("integrations.oauth.syncLastDays", {
                                  days: syncWindow?.days ?? 30,
                                })
                              : isToday
                                ? t("integrations.oauth.syncToday")
                                : t("integrations.oauth.syncDateButton", { date: formattedSyncDate })}
                      </button>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => void disconnectProvider(p)}
                        disabled={disconnecting === p.id}
                      >
                        {disconnecting === p.id
                          ? t("integrations.oauth.disconnecting")
                          : t("integrations.oauth.disconnect")}
                      </button>
                    </>
                  ) : (
                    <a
                      href={connectUrl(p)}
                      className="secondary integration-card__cta"
                      rel="noopener noreferrer"
                    >
                      {t("integrations.oauth.connectProvider", { name: p.name })}
                    </a>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
