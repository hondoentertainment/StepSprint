import { useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { isValidEmail } from "../utils";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !isValidEmail(email)) {
      setError("Please enter a valid email address.");
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
        <h1>Schafer Shufflers</h1>
        <p>Track steps. Compete with your team. Build habits that stick.</p>
      </header>
      <section className="panel panel-login">
        <h2>Reset password</h2>

        {sent ? (
          <>
            <p className="status status-success">
              If an account with that email exists, a password reset link has
              been sent. Check your email (or server console in dev mode).
            </p>
            <div className="form-links">
              <Link to="/" className="form-link">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Enter your email address and we'll send you a link to reset your
              password.
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                Email
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
                {busy ? "Sending..." : "Send reset link"}
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
