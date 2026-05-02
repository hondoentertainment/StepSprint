import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { declineAnalyticsConsent, grantAnalyticsConsent, shouldPromptAnalyticsConsent } from "../analytics";

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => shouldPromptAnalyticsConsent());

  if (!visible) return null;

  return (
    <div className="cookie-consent-banner" role="dialog" aria-label={t("cookieConsent.title")}>
      <div className="cookie-consent-inner">
        <p className="cookie-consent-text">{t("cookieConsent.body")}</p>
        <p className="cookie-consent-links">
          <Link to="/privacy">{t("legal.privacy")}</Link>
          <span aria-hidden> · </span>
          <Link to="/terms">{t("legal.terms")}</Link>
        </p>
        <div className="cookie-consent-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              declineAnalyticsConsent();
              setVisible(false);
            }}
          >
            {t("cookieConsent.decline")}
          </button>
          <button
            type="button"
            className="cta-primary"
            onClick={() => {
              grantAnalyticsConsent();
              setVisible(false);
            }}
          >
            {t("cookieConsent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
