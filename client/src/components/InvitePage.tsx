import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getErrorMessage, getApiUrl } from "../api";
import type { User } from "../types";

/** Standalone page for accepting invite links: /invite?token=... */
export function InvitePage({ onAccepted }: { onAccepted: (user: User) => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [challengeName, setChallengeName] = useState<string | null>(null);

  const acceptInvite = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setError("Missing invite token");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const res = await fetch(
        getApiUrl(`/api/invites/accept?token=${encodeURIComponent(token)}`),
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.user) {
        onAccepted(data.user);
        setChallengeName(data.challengeName || null);
        setStatus("success");
        const targetPath = data.challengeId ? `/home?challenge=${data.challengeId}` : "/home";
        setTimeout(() => navigate(targetPath, { replace: true }), 1500);
      } else {
        setStatus("error");
        setError(data.error || "Invalid invite");
      }
    } catch (err) {
      setStatus("error");
      setError(getErrorMessage(err));
    }
  }, [token, onAccepted, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await acceptInvite();
    })();
    return () => {
      cancelled = true;
    };
  }, [acceptInvite]);

  return (
    <div className="app">
      <section className="panel panel-login">
        <h2>Accepting invite</h2>
        {status === "loading" && <p className="status">Loading…</p>}
        {status === "success" && (
          <p className="status status-success" role="status" aria-live="polite">
            {challengeName
              ? `You've joined ${challengeName}. Redirecting…`
              : "Welcome! Redirecting…"}
          </p>
        )}
        {status === "error" && (
          <>
            <p className="status status-error" role="alert">{error}</p>
            {error !== "Missing invite token" && (
              <button
                type="button"
                className="cta-primary"
                onClick={acceptInvite}
                aria-label="Try again"
              >
                Try again
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
