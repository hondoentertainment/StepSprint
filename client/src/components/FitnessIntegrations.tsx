import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage, getApiUrl } from "../api";

type IntegrationToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type OAuthProvider = {
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

export function FitnessIntegrations({ challengeId, challengeTimezone }: Props) {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const syncUrl = getApiUrl("/api/integrations/apple-health");

  const oauthProviders = providers;
  const showOAuthSection = oauthProviders.some((p) => p.available || p.connected);

  const loadData = useCallback(async () => {
    try {
      const [tokenData, connData] = await Promise.all([
        api<{ tokens: IntegrationToken[] }>("/api/integrations/tokens"),
        api<{ providers: OAuthProvider[] }>("/api/integrations/connections"),
      ]);
      setTokens(tokenData.tokens);
      setProviders(connData.providers);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");
    if (oauthSuccess || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth_success");
      url.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", url.toString());
      if (oauthSuccess) void loadData();
      if (oauthError) setError(t("integrations.oauthError", { error: oauthError }));
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
      if (newToken) setNewToken(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevoking(null);
    }
  }

  async function disconnectProvider(provider: OAuthProvider) {
    try {
      setDisconnecting(provider.id);
      setError("");
      setSyncResult(null);
      await api(`/api/integrations/${provider.id.replace("_", "-")}/disconnect`, {
        method: "DELETE",
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDisconnecting(null);
    }
  }

  async function syncProvider(provider: OAuthProvider) {
    try {
      setSyncing(provider.id);
      setError("");
      setSyncResult(null);
      const result = await api<{ imported: number; updated: number; skipped: number }>(
        `/api/integrations/${provider.id.replace("_", "-")}/sync`,
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
      // clipboard unavailable
    }
  }

  function connectUrl(provider: OAuthProvider) {
    return getApiUrl(
      `/api/integrations/${provider.id.replace("_", "-")}/connect?challengeId=${encodeURIComponent(challengeId)}`
    );
  }

  if (loading) return <p className="hint">{t("common.loading")}</p>;

  return (
    <div className="apple-health-sync">
      <h3>{t("integrations.appleHealth.sectionTitle")}</h3>
      <p className="hint">{t("integrations.appleHealth.introOptional")}</p>
      <p className="hint">{t("integrations.appleHealth.introShortcut")}</p>
      {challengeTimezone && (
        <p className="hint" role="note">
          {t("integrations.appleHealth.challengeTimezoneHint", { timezone: challengeTimezone })}
        </p>
      )}
      <p className="hint">{t("integrations.appleHealth.batchBackfillHint")}</p>

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
                  <li>
                    {t("integrations.appleHealth.shortcutStep5Header", { token: newToken })}
                  </li>
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

      {!newToken && tokens.length > 0 && (
        <details className="shortcut-guide">
          <summary>{t("integrations.appleHealth.apiReferenceSummary")}</summary>
          <p>{t("integrations.appleHealth.apiReferenceIntro", { url: syncUrl })}</p>
          <pre className="shortcut-json">
            {t("integrations.appleHealth.apiReferenceExample", { challengeId })}
          </pre>
        </details>
      )}

      {showOAuthSection && (
        <div className="oauth-providers">
          <h4>{t("integrations.oauth.sectionTitle")}</h4>
          <p className="hint">{t("integrations.oauth.intro")}</p>
          <ul>
            {oauthProviders.map((p) => (
              <li key={p.id} className="oauth-provider-row">
                <span className="provider-name">{p.name}</span>
                {!p.available ? (
                  <span className="badge-coming-soon">{t("integrations.oauth.notConfigured")}</span>
                ) : p.connected ? (
                  <span className="provider-actions">
                    <span className="token-meta">
                      {p.connectedAt
                        ? t("integrations.oauth.connectedOn", {
                            date: new Date(p.connectedAt).toLocaleDateString(),
                          })
                        : t("integrations.oauth.connected")}
                    </span>
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
                  </span>
                ) : (
                  <a href={connectUrl(p)} className="secondary">
                    {t("integrations.oauth.connectProvider", { name: p.name })}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
