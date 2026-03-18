import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getErrorMessage } from "../api";

export function ResetPassword() {
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
          <h1>Schafer Shufflers</h1>
          <p>Track steps. Compete with your team. Build habits that stick.</p>
        </header>
        <section className="panel panel-login">
          <h2>Invalid link</h2>
          <p className="status status-error">
            This password reset link is invalid or incomplete.
          </p>
          <div className="form-links">
            <Link to="/forgot-password" className="form-link">
              Request a new reset link
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>Schafer Shufflers</h1>
        <p>Track steps. Compete with your team. Build habits that stick.</p>
      </header>
      <section className="panel panel-login">
        <h2>Set new password</h2>

        {success ? (
          <>
            <p className="status status-success">
              Your password has been reset. You can now sign in with your new
              password.
            </p>
            <div className="form-links">
              <Link to="/" className="form-link">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Choose a new password for <strong>{email}</strong>.
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                New password
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label>
                Confirm new password
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

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
                {busy ? "Resetting..." : "Reset password"}
              </button>
            </form>
            <div className="form-links">
              <Link to="/" className="form-link">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
