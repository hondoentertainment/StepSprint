import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../api";
import { isValidEmail } from "../utils";
import type { User } from "../types";

type Props = {
  onLogin: (email: string, password: string) => Promise<User>;
  onRegister: (email: string, password: string, name?: string) => Promise<User>;
};

type StrengthKey = "tooShort" | "weak" | "fair" | "strong";

function getPasswordStrength(pw: string): { key: StrengthKey; cls: string } {
  if (pw.length < 8) return { key: "tooShort", cls: "pw-weak" };
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  if (!hasLetter || !hasNumber) return { key: "weak", cls: "pw-weak" };
  if (pw.length >= 12 && hasSpecial) return { key: "strong", cls: "pw-strong" };
  if (pw.length >= 10 || hasSpecial) return { key: "fair", cls: "pw-fair" };
  return { key: "fair", cls: "pw-fair" };
}

export function Login({ onLogin, onRegister }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register" | "setup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("login.errors.emailRequired"));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t("login.errors.emailInvalid"));
      return;
    }
    if (!password) {
      setError(t("login.errors.passwordRequired"));
      return;
    }

    if (mode === "register" || mode === "setup") {
      if (password.length < 8) {
        setError(t("login.errors.passwordTooShort"));
        return;
      }
      if (!/[a-zA-Z]/.test(password)) {
        setError(t("login.errors.passwordNeedsLetter"));
        return;
      }
      if (!/[0-9]/.test(password)) {
        setError(t("login.errors.passwordNeedsNumber"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("login.errors.passwordsDoNotMatch"));
        return;
      }
    }

    try {
      setBusy(true);
      setError("");
      if (mode === "login") {
        await onLogin(email.trim(), password);
      } else {
        await onRegister(
          email.trim(),
          password,
          name?.trim() || undefined
        );
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg === "PASSWORD_SETUP_REQUIRED") {
        setMode("setup");
        setPassword("");
        setConfirmPassword("");
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const strength = (mode === "register" || mode === "setup") && password
    ? getPasswordStrength(password)
    : null;

  const isRegisterMode = mode === "register" || mode === "setup";

  return (
    <div className="app">
      <header className="hero">
        <h1>{t("app.name")}</h1>
        <p>{t("app.tagline")}</p>
      </header>
      <section className="panel panel-login">
        <h2>
          {mode === "login"
            ? t("login.title.login")
            : mode === "setup"
              ? t("login.title.setup")
              : t("login.title.register")}
        </h2>

        {mode === "setup" && (
          <p className="hint">{t("login.hint.setup")}</p>
        )}
        {mode === "login" && (
          <p className="hint">{t("login.hint.login")}</p>
        )}
        {mode === "register" && (
          <p className="hint">{t("login.hint.register")}</p>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            {t("login.email")}
            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              readOnly={mode === "setup"}
              aria-invalid={!!error && error.toLowerCase().includes("email")}
            />
          </label>

          {mode === "register" && (
            <label>
              {t("login.name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label>
            {t("login.password")}
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword
                    ? t("login.hidePassword")
                    : t("login.showPassword")
                }
              >
                {showPassword ? t("login.hide") : t("login.show")}
              </button>
            </div>
          </label>

          {strength && (
            <div className="password-strength">
              <div className={`password-strength-bar ${strength.cls}`} />
              <span className={`password-strength-label ${strength.cls}`}>
                {t(`login.strength.${strength.key}`)}
              </span>
            </div>
          )}

          {isRegisterMode && (
            <label>
              {t("login.confirmPassword")}
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}

          {isRegisterMode && (
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
          )}

          {error && (
            <p className="status status-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!email.trim() || !password || busy}
            className="cta-primary"
          >
            {busy
              ? isRegisterMode
                ? t("login.submit.registering")
                : t("login.submit.loggingIn")
              : isRegisterMode
                ? t("login.submit.register")
                : t("login.submit.login")}
          </button>
        </form>

        <div className="form-links">
          {mode === "login" && (
            <>
              <Link to="/forgot-password" className="form-link">
                {t("login.links.forgot")}
              </Link>
              <button
                type="button"
                className="form-link link-button"
                onClick={() => {
                  setMode("register");
                  setError("");
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                {t("login.links.toRegister")}
              </button>
            </>
          )}
          {mode === "register" && (
            <button
              type="button"
              className="form-link link-button"
              onClick={() => {
                setMode("login");
                setError("");
                setPassword("");
                setConfirmPassword("");
              }}
            >
              {t("login.links.toLogin")}
            </button>
          )}
          {mode === "setup" && (
            <button
              type="button"
              className="form-link link-button"
              onClick={() => {
                setMode("login");
                setError("");
                setPassword("");
                setConfirmPassword("");
              }}
            >
              {t("login.links.backToLogin")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
