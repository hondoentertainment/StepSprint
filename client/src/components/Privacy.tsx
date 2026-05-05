import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function Privacy() {
  const { t } = useTranslation();
  const showDraftNotice =
    import.meta.env.VITE_LEGAL_CONTENT_REVIEWED !== "true";
  return (
    <div className="app">
      <main id="main-content" className="panel legal-page" tabIndex={-1}>
        {showDraftNotice ? (
          <p className="hint legal-production-notice" role="note">
            {t("legal.productionNotice")}
          </p>
        ) : null}
        <h1>{t("legal.privacyTitle")}</h1>
        <p className="hint">{t("legal.privacyIntro")}</p>
        <h2>{t("legal.privacyCollected")}</h2>
        <ul>
          <li>{t("legal.privacyAccount")}</li>
          <li>{t("legal.privacySteps")}</li>
          <li>{t("legal.privacyAnalytics")}</li>
        </ul>
        <h2>{t("legal.privacyCookies")}</h2>
        <p>{t("legal.privacyCookiesBody")}</p>
        <h2>{t("legal.privacyContact")}</h2>
        <p>{t("legal.privacyContactBody")}</p>
        <p>
          <Link to="/" className="form-link">
            {t("legal.backHome")}
          </Link>
        </p>
      </main>
    </div>
  );
}
