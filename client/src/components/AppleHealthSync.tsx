import { useState, useEffect, useCallback } from "react";
import { api, getErrorMessage, getApiUrl } from "../api";

type IntegrationToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type Props = {
  challengeId: string;
};

export function AppleHealthSync({ challengeId }: Props) {
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const syncUrl = getApiUrl("/api/integrations/apple-health");

  const loadTokens = useCallback(async () => {
    try {
      const data = await api<{ tokens: IntegrationToken[] }>("/api/integrations/tokens");
      setTokens(data.tokens);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  async function createToken() {
    try {
      setCreating(true);
      setError("");
      setNewToken(null);
      const data = await api<{ token: string; label: string }>("/api/integrations/tokens", {
        method: "POST",
        body: JSON.stringify({ label: "Apple Watch Sync" }),
      });
      setNewToken(data.token);
      await loadTokens();
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
      await api(`/api/integrations/tokens/${id}`, { method: "DELETE" });
      if (newToken) setNewToken(null);
      await loadTokens();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevoking(null);
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

  const shortcutBody = newToken
    ? JSON.stringify({ challengeId, date: "{{date}}", steps: "{{steps}}" }, null, 2)
    : null;

  return (
    <div className="apple-health-sync">
      <h3>Apple Watch / Apple Health sync</h3>
      <p className="hint">
        Use an iOS Shortcut to automatically send your Apple Watch step count to
        StepSprint each day. Generate an API token below, then follow the setup
        guide.
      </p>

      {error && <p className="status status-error" role="alert">{error}</p>}

      {/* New token reveal */}
      {newToken && (
        <div className="token-reveal panel">
          <p className="status status-success">
            Token created. Copy it now — it will not be shown again.
          </p>
          <code className="token-value" aria-label="API token">{newToken}</code>
          <button
            type="button"
            className="cta-secondary"
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
                Add a <strong>Calculate Statistics</strong> action on the Health
                Samples result. Set Function to <strong>Sum</strong>. This gives
                you your daily step total.
              </li>
              <li>
                Add a <strong>Format Date</strong> action on the current date.
                Use format <code>yyyy-MM-dd</code>.
              </li>
              <li>
                Add a <strong>Get Contents of URL</strong> action and configure
                it:
                <ul>
                  <li>
                    URL: <code>{syncUrl}</code>
                  </li>
                  <li>Method: POST</li>
                  <li>
                    Headers: <code>Authorization</code> ={" "}
                    <code>Bearer {newToken}</code>
                  </li>
                  <li>
                    Request Body: JSON with keys{" "}
                    <code>challengeId</code>, <code>date</code>,{" "}
                    <code>steps</code>:
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
                Optionally add this shortcut to an <strong>Automation</strong>{" "}
                (Shortcuts &gt; Automation &gt; +) triggered at midnight or
                bedtime so it runs daily without manual input.
              </li>
            </ol>
            <p className="hint">
              You can also call the endpoint from any HTTP client using{" "}
              <code>Authorization: Bearer {newToken}</code>.
            </p>
          </details>
        </div>
      )}

      {/* Token list */}
      <div className="token-list">
        <h4>Your API tokens</h4>
        {loading ? (
          <p className="hint">Loading…</p>
        ) : tokens.length === 0 ? (
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
          className="cta-secondary"
          onClick={() => void createToken()}
          disabled={creating}
        >
          {creating ? "Generating…" : "Generate new token"}
        </button>
      </div>

      {/* Reference */}
      {!newToken && tokens.length > 0 && (
        <details className="shortcut-guide">
          <summary>API endpoint reference</summary>
          <p>
            Send a POST request to <code>{syncUrl}</code> with header{" "}
            <code>Authorization: Bearer &lt;your-token&gt;</code> and a JSON
            body:
          </p>
          <pre className="shortcut-json">
{`// Single day
{
  "challengeId": "${challengeId}",
  "date": "YYYY-MM-DD",
  "steps": 8000
}

// Batch (up to 31 days)
{
  "challengeId": "${challengeId}",
  "rows": [
    { "date": "YYYY-MM-DD", "steps": 8000 },
    { "date": "YYYY-MM-DD", "steps": 9500 }
  ]
}`}
          </pre>
          {shortcutBody && <p className="hint">Example body: <code>{shortcutBody}</code></p>}
        </details>
      )}
    </div>
  );
}
