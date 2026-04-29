import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getErrorMessage, getApiUrl } from "../api";
import type { User } from "../types";

/** Standalone page for accepting invite links: /invite?token=... */
export function InvitePage({ onAccepted }: { onAccepted: (user: User) => void }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [challengeName, setChallengeName] = useState<string | null>(null);

  const acceptInvite = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setError(t("invite.missingToken"));
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
  }, [token, onAccepted, navigate, t]);

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
        <h2>{t("invite.title")}</h2>
        {status === "loading" && <p className="status">{t("invite.loading")}</p>}
        {status === "success" && (
          <p className="status status-success" role="status" aria-live="polite">
            {challengeName
              ? t("invite.successWithChallenge", { challengeName })
              : t("invite.successGeneric")}
          </p>
        )}
        {status === "error" && (
          <>
            <p className="status status-error" role="alert">{error}</p>
            {error !== t("invite.missingToken") && (
              <button
                type="button"
                className="cta-primary"
                onClick={acceptInvite}
                aria-label={t("common.tryAgain")}
              >
                {t("common.tryAgain")}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
