import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function Terms() {
  const { t } = useTranslation();
  return (
    <div className="app">
      <main id="main-content" className="panel legal-page" tabIndex={-1}>
        <h1>{t("legal.termsTitle")}</h1>
        <p className="hint">{t("legal.termsIntro")}</p>
        <h2>{t("legal.termsUse")}</h2>
        <p>{t("legal.termsUseBody")}</p>
        <h2>{t("legal.termsConduct")}</h2>
        <p>{t("legal.termsConductBody")}</p>
        <h2>{t("legal.termsDisclaimer")}</h2>
        <p>{t("legal.termsDisclaimerBody")}</p>
        <p>
          <Link to="/" className="form-link">
            {t("legal.backHome")}
          </Link>
        </p>
      </main>
    </div>
  );
}
