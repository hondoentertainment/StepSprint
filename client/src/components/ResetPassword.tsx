import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api";

export function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("resetPassword.errors.tooShort"));
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError(t("resetPassword.errors.needsLetter"));
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError(t("resetPassword.errors.needsNumber"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("resetPassword.errors.doNotMatch"));
      return;
    }
    try {
      setBusy(true);
      setError("");
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, email, password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="app">
        <header className="hero">
          <h1>{t("app.name")}</h1>
          <p>{t("app.tagline")}</p>
        </header>
        <section className="panel panel-login">
          <h2>{t("resetPassword.invalidTitle")}</h2>
          <p className="status status-error">
            {t("resetPassword.invalidMessage")}
          </p>
          <div className="form-links">
            <Link to="/forgot-password" className="form-link">
              {t("resetPassword.requestNewLink")}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>{t("app.name")}</h1>
        <p>{t("app.tagline")}</p>
      </header>
      <section className="panel panel-login">
        <h2>{t("resetPassword.title")}</h2>

        {success ? (
          <>
            <p className="status status-success">
              {t("resetPassword.successMessage")}
            </p>
            <div className="form-links">
              <Link to="/" className="form-link">
                {t("resetPassword.signIn")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              {t("resetPassword.hint", { email })}
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                {t("resetPassword.newPasswordLabel")}
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  >
                    {showPassword ? t("login.hide") : t("login.show")}
                  </button>
                </div>
              </label>

              <label>
                {t("resetPassword.confirmPasswordLabel")}
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <ul className="password-requirements">
                <li className={password.length >= 8 ? "met" : ""}>
                  {t("login.requirements.length")}
                </li>
                <li className={/[a-zA-Z]/.test(password) ? "met" : ""}>
                  {t("login.requirements.letter")}
                </li>
                <li className={/[0-9]/.test(password) ? "met" : ""}>
                  {t("login.requirements.number")}
                </li>
              </ul>

              {error && (
                <p className="status status-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!password || !confirmPassword || busy}
                className="cta-primary"
              >
                {busy ? t("resetPassword.resetting") : t("resetPassword.submit")}
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
