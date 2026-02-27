import { useState, useRef, useEffect } from "react";
import { getErrorMessage } from "../api";
import { isValidEmail } from "../utils";
import type { User } from "../types";

type Props = {
  onLogin: (email: string, name?: string) => Promise<User>;
};

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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
    try {
      setBusy(true);
      setError("");
      await onLogin(email.trim(), name?.trim() || undefined);
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
        <h2>Sign in</h2>
        <p className="hint">
          Enter the email address used when you were invited to a step challenge.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={!!error && error.includes("email")}
              aria-describedby={error && error.includes("email") ? "login-error" : undefined}
            />
          </label>
          <label>
            Name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          {error && (
            <p id="login-error" className="status status-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!email.trim() || busy}
            className="cta-primary"
          >
            {busy ? "Signing in…" : "Get started"}
          </button>
        </form>
      </section>
    </div>
  );
}
