import { useState, useEffect, useCallback } from "react";
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
};

export function AppleHealthSync({ challengeId }: Props) {
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

  const oauthProviders = providers.filter((p) => p.id === "fitbit" || p.id === "google_fit");
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

  // Pick up oauth_success / oauth_error signals from OAuth redirects
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
      if (oauthError) setError(`OAuth error: ${oauthError}`);
    }
  }, [loadData]);

  async function createToken() {
    try {
      setCreating(true);
      setError("");
      setNewToken(null);
      setSyncResult(null);
      const data = await api<{ token: string; label: string }>("/api/integrations/tokens", {
        method: "POST",
        body: JSON.stringify({ label: "Apple Watch Sync" }),
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
        `${provider.name}: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped.`
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
      // clipboard not available — user can copy manually
    }
  }

  function connectUrl(provider: OAuthProvider) {
    return getApiUrl(
      `/api/integrations/${provider.id.replace("_", "-")}/connect?challengeId=${encodeURIComponent(challengeId)}`
    );
  }

  if (loading) return <p className="hint">Loading…</p>;

  return (
    <div className="apple-health-sync">
      <h3>Apple Watch / Apple Health sync</h3>
      <p className="hint">
        Use an iOS Shortcut to automatically send your Apple Watch step count to StepSprint
        each day. Generate an API token below, then follow the setup guide.
      </p>

      {error && <p className="status status-error" role="alert">{error}</p>}
      {syncResult && <p className="status status-success" role="status">{syncResult}</p>}

      {/* New token reveal */}
      {newToken && (
        <div className="token-reveal panel">
          <p className="status status-success">
            Token created. Copy it now — it will not be shown again.
          </p>
          <code className="token-value" aria-label="API token">{newToken}</code>
          <button
            type="button"
            className="secondary"
            onClick={() => void copyToClipboard(newToken)}
          >
            {copied ? "Copied!" : "Copy token"}
          </button>

          <details className="shortcut-guide">
            <summary>iOS Shortcut setup instructions</summary>
            <ol>
              <li>
                Open the <strong>Shortcuts</strong> app on your iPhone and tap{" "}
                <strong>+</strong> to create a new shortcut.
              </li>
              <li>
                Add a <strong>Get Health Sample</strong> action. Set Type to{" "}
                <strong>Steps</strong> and Interval to <strong>Day</strong>.
              </li>
              <li>
                Add a <strong>Calculate Statistics</strong> action on the Health Samples
                result. Set Function to <strong>Sum</strong>.
              </li>
              <li>
                Add a <strong>Format Date</strong> action on the current date. Use format{" "}
                <code>yyyy-MM-dd</code>.
              </li>
              <li>
                Add a <strong>Get Contents of URL</strong> action:
                <ul>
                  <li>URL: <code>{syncUrl}</code></li>
                  <li>Method: POST</li>
                  <li>Header: <code>Authorization</code> = <code>Bearer {newToken}</code></li>
                  <li>
                    Request Body (JSON):
                    <pre className="shortcut-json">
{`{
  "challengeId": "${challengeId}",
  "date": "<formatted date from step 4>",
  "steps": <sum from step 3>
}`}
                    </pre>
                  </li>
                </ul>
              </li>
              <li>
                Optionally add this shortcut to an <strong>Automation</strong> triggered at
                midnight so it runs daily automatically.
              </li>
            </ol>
          </details>
        </div>
      )}

      {/* Token list */}
      <div className="token-list">
        <h4>API tokens</h4>
        {tokens.length === 0 ? (
          <p className="hint">No tokens yet.</p>
        ) : (
          <ul>
            {tokens.map((t) => (
              <li key={t.id} className="token-row">
                <span className="token-label">{t.label}</span>
                <span className="token-meta">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt && (
                    <> &middot; Last used {new Date(t.lastUsedAt).toLocaleDateString()}</>
                  )}
                  {t.expiresAt && (
                    <> &middot; Expires {new Date(t.expiresAt).toLocaleDateString()}</>
                  )}
                </span>
                <button
                  type="button"
                  className="link-button danger"
                  onClick={() => void revokeToken(t.id)}
                  disabled={revoking === t.id}
                  aria-label={`Revoke token ${t.label}`}
                >
                  {revoking === t.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => void createToken()}
          disabled={creating}
        >
          {creating ? "Generating…" : "Generate new token"}
        </button>
      </div>

      {/* API reference for users who already have tokens */}
      {!newToken && tokens.length > 0 && (
        <details className="shortcut-guide">
          <summary>API endpoint reference</summary>
          <p>
            POST to <code>{syncUrl}</code> with header{" "}
            <code>Authorization: Bearer &lt;your-token&gt;</code>:
          </p>
          <pre className="shortcut-json">
{`// Single day
{ "challengeId": "${challengeId}", "date": "YYYY-MM-DD", "steps": 8000 }

// Batch (up to 31 days)
{ "challengeId": "${challengeId}", "rows": [{ "date": "YYYY-MM-DD", "steps": 8000 }] }`}
          </pre>
        </details>
      )}

      {/* OAuth providers (only when Fitbit/Google are configured or already linked) */}
      {showOAuthSection && (
        <div className="oauth-providers">
          <h4>Connected fitness services</h4>
          <p className="hint">
            Connect Fitbit or Google Fit to sync steps directly — no Shortcut required.
          </p>
          <ul>
            {oauthProviders.map((p) => (
              <li key={p.id} className="oauth-provider-row">
                <span className="provider-name">{p.name}</span>
                {!p.available ? (
                  <span className="badge-coming-soon">Not configured</span>
                ) : p.connected ? (
                  <span className="provider-actions">
                    <span className="token-meta">
                      Connected {p.connectedAt ? new Date(p.connectedAt).toLocaleDateString() : ""}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void syncProvider(p)}
                      disabled={syncing === p.id}
                    >
                      {syncing === p.id ? "Syncing…" : "Sync today"}
                    </button>
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => void disconnectProvider(p)}
                      disabled={disconnecting === p.id}
                    >
                      {disconnecting === p.id ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </span>
                ) : (
                  <a href={connectUrl(p)} className="secondary">
                    Connect {p.name}
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
