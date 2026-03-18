import { useState } from "react";
import { api } from "../api";
import { getErrorMessage } from "../api";
import { todayInTimezone, isFutureDate } from "../utils";
import type { Challenge } from "../types";
import type { Summary } from "../types";

const MIN_STEPS = 0;
const MAX_STEPS = 999999;

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
  const [date, setDate] = useState(() => todayInTimezone());
  const [steps, setSteps] = useState(8000);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <p className="hint">
        <button
          type="button"
          className="link-button"
          onClick={() => api("/api/integrations/fitness").then((d) => alert((d as { message: string }).message))}
        >
          Connect fitness device
        </button>{" "}
        <span className="badge-coming-soon">Coming soon</span> (Google Fit, Apple Health)
      </p>
    </section>
  );
}
