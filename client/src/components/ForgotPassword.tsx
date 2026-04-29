import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api";
import { isValidEmail } from "../utils";

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !isValidEmail(email)) {
      setError(t("forgotPassword.errors.invalidEmail"));
      return;
    }
    try {
      setBusy(true);
      setError("");
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>{t("app.name")}</h1>
        <p>{t("app.tagline")}</p>
      </header>
      <section className="panel panel-login">
        <h2>{t("forgotPassword.title")}</h2>

        {sent ? (
          <>
            <p className="status status-success">
              {t("forgotPassword.successMessage")}
            </p>
            <div className="form-links">
              <Link to="/" className="form-link">
                {t("common.backToSignIn")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="hint">{t("forgotPassword.hint")}</p>
            <form onSubmit={handleSubmit}>
              <label>
                {t("forgotPassword.emailLabel")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </label>

              {error && (
                <p className="status status-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!email.trim() || busy}
                className="cta-primary"
              >
                {busy ? t("forgotPassword.sending") : t("forgotPassword.submit")}
              </button>
            </form>
            <div className="form-links">
              <Link to="/" className="form-link">
                {t("common.backToSignIn")}
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
