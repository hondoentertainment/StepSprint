import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api";
import { StepSprintLogo } from "./StepSprintLogo";

function VerifyEmailShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="app">
      <header className="hero">
        <div className="hero-logo">
          <StepSprintLogo size={40} />
          <h1>{t("app.name")}</h1>
        </div>
        <p>{t("app.tagline")}</p>
      </header>
      <section className="panel panel-login">
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

/** Handles links from signup: /verify-email?token=&email= */
export function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const rawEmail = params.get("email") ?? "";

  if (!token || !rawEmail.trim()) {
    return (
      <VerifyEmailShell title={t("verifyEmail.title")}>
        <p className="status status-error" role="alert">
          {t("verifyEmail.invalidLink")}
        </p>
        <div className="form-links">
          <Link to="/" className="form-link">
            {t("common.backToSignIn")}
          </Link>
        </div>
      </VerifyEmailShell>
    );
  }

  const email = rawEmail.trim().toLowerCase();

  return <VerifyEmailRequest token={token} email={email} />;
}

function VerifyEmailRequest({ token, email }: { token: string; email: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        const data = await api<{ ok?: boolean; message?: string }>(
          "/api/auth/verify-email",
          {
            method: "POST",
            body: JSON.stringify({ token, email }),
          }
        );
        if (cancelled) return;
        if (data.ok) {
          setStatus("ok");
          setMessage(data.message ?? t("verifyEmail.success"));
        } else {
          setStatus("error");
          setMessage(t("verifyEmail.failed"));
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(getErrorMessage(err));
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, email, t]);

  return (
    <VerifyEmailShell title={t("verifyEmail.title")}>
      {status === "working" && (
        <p className="status" role="status">
          {t("verifyEmail.working")}
        </p>
      )}
      {status === "ok" && (
        <>
          <p className="status status-success" role="status">
            {message}
          </p>
          <div className="form-links">
            <Link to="/" className="form-link">
              {t("common.backToSignIn")}
            </Link>
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <p className="status status-error" role="alert">
            {message}
          </p>
          <div className="form-links">
            <Link to="/" className="form-link">
              {t("common.backToSignIn")}
            </Link>
          </div>
        </>
      )}
    </VerifyEmailShell>
  );
}
