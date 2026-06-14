import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getApiUrl, getErrorMessage } from "../api";
import { todayInTimezone, isFutureDate } from "../utils";
import type { Challenge } from "../types";
import type { Summary } from "../types";

const MIN_STEPS = 0;
const MAX_STEPS = 999999;

type FitnessProviderInfo = {
  id: string;
  name: string;
  available: boolean;
  connectPath?: string;
  connected?: boolean;
  note?: string;
};

type FitnessStatusResponse = {
  connected: boolean;
  providers: FitnessProviderInfo[];
  message: string;
};

type Props = {
  challengeId: string;
  selectedChallenge: Challenge | null;
  challengesLoading: boolean;
  onSummaryUpdated?: (summary: Summary) => void;
};

export function Submit({
  challengeId,
  selectedChallenge,
  challengesLoading,
  onSummaryUpdated,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(() => todayInTimezone());
  const [steps, setSteps] = useState(8000);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fitnessOpen, setFitnessOpen] = useState(false);
  const [fitness, setFitness] = useState<FitnessStatusResponse | null>(null);
  const [fitnessLoadError, setFitnessLoadError] = useState("");
  const [fitnessBanner, setFitnessBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const loadFitness = useCallback(() => {
    api<FitnessStatusResponse>("/api/integrations/fitness")
      .then((d) => {
        setFitness(d);
        setFitnessLoadError("");
      })
      .catch((err) => {
        setFitness(null);
        setFitnessLoadError(getErrorMessage(err));
      });
  }, []);

  useEffect(() => {
    const f = searchParams.get("fitness");
    const msg = searchParams.get("message");
    const p = searchParams.get("p");
    if (f === "connected") {
      const label = p === "fitbit" ? "Fitbit" : p === "google_fit" ? "Google Fit" : "your device";
      setFitnessBanner({ type: "success", text: `Connected ${label}. Tap “Sync now” to import recent steps.` });
      loadFitness();
    } else if (f === "error" && msg) {
      setFitnessBanner({ type: "error", text: decodeURIComponent(msg) });
    }
    if (f) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, loadFitness]);

  useEffect(() => {
    if (fitnessOpen) loadFitness();
  }, [fitnessOpen, loadFitness]);

  function resetDate() {
    setDate(todayInTimezone(selectedChallenge?.timezone));
  }

  function getValidationError(): string | null {
    if (!date) return "Please select a date.";
    if (isFutureDate(date, selectedChallenge?.timezone)) {
      return "Cannot submit steps for a future date.";
    }
    const n = Number(steps);
    if (Number.isNaN(n) || n < MIN_STEPS) return `Steps must be at least ${MIN_STEPS}.`;
    if (n > MAX_STEPS) return `Steps cannot exceed ${MAX_STEPS.toLocaleString()}.`;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    const validationError = getValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError("");
      setSuccess("");
      setIsSubmitting(true);
      await api("/api/submissions", {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          date,
          steps: Number(steps),
        }),
      });
      setSteps(8000);
      resetDate();
      setSuccess("Steps submitted successfully.");
      const summary = await api<Summary>(`/api/me/summary?challengeId=${challengeId}`);
      onSummaryUpdated?.(summary);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSyncNow() {
    try {
      setSyncBusy(true);
      setFitnessBanner(null);
      const r = await api<{ daysWritten: number }>("/api/integrations/fitness/sync", { method: "POST" });
      setFitnessBanner({
        type: "success",
        text:
          r.daysWritten > 0
            ? `Imported or updated ${r.daysWritten} day(s) from connected providers.`
            : "Sync complete. No new days to import (you may already be up to date, or manual entries block imports for those days).",
      });
      const summary = await api<Summary>(`/api/me/summary?challengeId=${challengeId}`);
      onSummaryUpdated?.(summary);
    } catch (err) {
      setFitnessBanner({ type: "error", text: getErrorMessage(err) });
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleDisconnect(providerId: string) {
    try {
      await api(`/api/integrations/fitness/${providerId}`, { method: "DELETE" });
      loadFitness();
      setFitnessBanner({ type: "success", text: "Disconnected." });
    } catch (err) {
      setFitnessBanner({ type: "error", text: getErrorMessage(err) });
    }
  }

  const validationError = getValidationError();
  const canSubmit = date && challengeId && !validationError && !isSubmitting;

  return (
    <section className="panel">
      <h2>Submit steps</h2>
      {!challengeId && !challengesLoading && (
        <p className="status status-error">Choose an active challenge before submitting steps.</p>
      )}
      {error && <p className="status status-error" role="alert">{error}</p>}
      {success && <p className="status status-success" role="status" aria-live="polite">{success}</p>}
      <form onSubmit={handleSubmit}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Steps
          <input
            type="number"
            min={MIN_STEPS}
            max={MAX_STEPS}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
          />
        </label>
        <button type="submit" disabled={!canSubmit} className="cta-primary">
          {isSubmitting ? "Submitting…" : "Log steps"}
        </button>
      </form>
      <p className="hint">Submissions above 100,000 steps are flagged.</p>

      <div className="fitness-import">
        <button type="button" className="link-button fitness-import-toggle" onClick={() => setFitnessOpen((o) => !o)}>
          {fitnessOpen ? "Hide" : "Show"} fitness import
        </button>
        {fitnessOpen && (
          <div className="fitness-import-panel">
            {fitnessBanner && (
              <p className={`status status-${fitnessBanner.type === "success" ? "success" : "error"}`} role="status">
                {fitnessBanner.text}
              </p>
            )}
            {fitnessLoadError && <p className="status status-error">{fitnessLoadError}</p>}
            {fitness && (
              <>
                <p className="hint">{fitness.message}</p>
                <div className="fitness-actions">
                  <button type="button" className="secondary" disabled={syncBusy || !fitness.connected} onClick={handleSyncNow}>
                    {syncBusy ? "Syncing…" : "Sync now"}
                  </button>
                </div>
                <ul className="fitness-provider-list">
                  {fitness.providers.map((p) => (
                    <li key={p.id}>
                      <div className="fitness-provider-row">
                        <div>
                          <strong>{p.name}</strong>
                          {p.connected ? (
                            <span className="badge-connected">Connected</span>
                          ) : p.available ? (
                            <span className="badge-ready">Ready to connect</span>
                          ) : (
                            <span className="badge-coming-soon">Not configured</span>
                          )}
                          {p.note && <p className="hint tight">{p.note}</p>}
                        </div>
                        <div className="fitness-provider-actions">
                          {p.available && p.connectPath && !p.connected && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                window.location.assign(getApiUrl(p.connectPath!));
                              }}
                            >
                              Connect
                            </button>
                          )}
                          {p.connected && (
                            <button type="button" className="secondary danger-outline" onClick={() => void handleDisconnect(p.id)}>
                              Disconnect
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
