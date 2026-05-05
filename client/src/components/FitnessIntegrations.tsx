import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError, getErrorMessage, getApiUrl } from "../api";
import { ANALYTICS_EVENTS, track, trackAppleHealthSyncFirstObserved } from "../analytics";
import { IconFootstep, IconWearable } from "./Icons";
import { todayInTimezone } from "../utils";

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
};

type Props = {
  challengeId: string;
  challengeTimezone?: string;
};

function providerUrlSlug(id: string): string {
  return id.replace(/_/g, "-");
}

export function FitnessIntegrations({ challengeId, challengeTimezone }: Props) {
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
    const dateISO = todayInTimezone(challengeTimezone);
    return buildAppleHealthCurlCommand(syncUrl, token, challengeId, dateISO, 1000);
  }, [newToken, syncUrl, challengeId, challengeTimezone, t]);

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

  async function syncProvider(provider: FitnessProviderRow) {
    try {
      setSyncing(provider.id);
      setError("");
      setSyncResult(null);
      const result = await api<{ imported: number; updated: number; skipped: number }>(
        `/api/integrations/${providerUrlSlug(provider.id)}/sync`,
        {
          method: "POST",
          body: JSON.stringify({ challengeId }),
        }
      );
      setSyncResult(
        t("integrations.syncResult", {
          name: provider.name,
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
        })
      );
      track(ANALYTICS_EVENTS.integrationOauthSync, {
        provider: provider.id,
        challengeId,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      });
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

                <div className="integration-card__actions">
                  {!p.available ? (
                    <p className="hint integration-card__admin-hint">{t("integrations.oauthAdminHint")}</p>
                  ) : p.connected ? (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void syncProvider(p)}
                        disabled={syncing === p.id}
                      >
                        {syncing === p.id ? t("integrations.oauth.syncing") : t("integrations.oauth.syncToday")}
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
