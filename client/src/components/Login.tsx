import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage } from "../api";
import { isValidEmail } from "../utils";
import { identify } from "../analytics";
import type { User } from "../types";

type Props = {
  onLogin: (email: string, password: string) => Promise<User>;
  onRegister: (email: string, password: string, name?: string) => Promise<User>;
};

function getPasswordStrength(pw: string): { label: string; cls: string } {
  if (pw.length < 8) return { label: "Too short", cls: "pw-weak" };
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  if (!hasLetter || !hasNumber) return { label: "Weak", cls: "pw-weak" };
  if (pw.length >= 12 && hasSpecial) return { label: "Strong", cls: "pw-strong" };
  if (pw.length >= 10 || hasSpecial) return { label: "Fair", cls: "pw-fair" };
  return { label: "Fair", cls: "pw-fair" };
}

export function Login({ onLogin, onRegister }: Props) {
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
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address (e.g. you@example.com).");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }

    if (mode === "register" || mode === "setup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!/[a-zA-Z]/.test(password)) {
        setError("Password must contain at least one letter.");
        return;
      }
      if (!/[0-9]/.test(password)) {
        setError("Password must contain at least one number.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    try {
      setBusy(true);
      setError("");
      let user: User;
      if (mode === "login") {
        user = await onLogin(email.trim(), password);
      } else {
        user = await onRegister(
          email.trim(),
          password,
          name?.trim() || undefined
        );
      }
      identify(user.id);
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
        <h1>Schafer Shufflers</h1>
        <p>Track steps. Compete with your team. Build habits that stick.</p>
      </header>
      <section className="panel panel-login">
        <h2>
          {mode === "login"
            ? "Sign in"
            : mode === "setup"
              ? "Set your password"
              : "Create account"}
        </h2>

        {mode === "setup" && (
          <p className="hint">
            Your account was created before passwords were required. Please set
            a password to continue.
          </p>
        )}
        {mode === "login" && (
          <p className="hint">
            Enter your email and password to sign in.
          </p>
        )}
        {mode === "register" && (
          <p className="hint">
            Create an account to join a step challenge.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Email
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
              Name (optional)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Password
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
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {strength && (
            <div className="password-strength">
              <div className={`password-strength-bar ${strength.cls}`} />
              <span className={`password-strength-label ${strength.cls}`}>
                {strength.label}
              </span>
            </div>
          )}

          {isRegisterMode && (
            <label>
              Confirm password
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
                At least 8 characters
              </li>
              <li className={/[a-zA-Z]/.test(password) ? "met" : ""}>
                At least one letter
              </li>
              <li className={/[0-9]/.test(password) ? "met" : ""}>
                At least one number
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
                ? "Creating account..."
                : "Signing in..."
              : isRegisterMode
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="form-links">
          {mode === "login" && (
            <>
              <Link to="/forgot-password" className="form-link">
                Forgot password?
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
                Don't have an account? Sign up
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
              Already have an account? Sign in
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
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
