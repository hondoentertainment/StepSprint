import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LOCALE_STORAGE_KEY } from "../i18n";

export function LegalFooter() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";

  return (
    <footer className="legal-footer" role="contentinfo">
      <label className="legal-footer-lang">
        <span className="sr-only">{t("layout.languageSelectAria")}</span>
        <select
          className="legal-footer-lang-select"
          aria-label={t("layout.languageSelectAria")}
          value={lang}
          onChange={(e) => {
            const next = e.target.value === "es" ? "es" : "en";
            void i18n.changeLanguage(next);
            try {
              localStorage.setItem(LOCALE_STORAGE_KEY, next);
            } catch {
              /* ignore */
            }
          }}
        >
          <option value="en">{t("layout.localeEnglish")}</option>
          <option value="es">{t("layout.localeSpanish")}</option>
        </select>
      </label>
      <span aria-hidden> · </span>
      <Link to="/privacy">{t("legal.privacy")}</Link>
      <span aria-hidden> · </span>
      <Link to="/terms">{t("legal.terms")}</Link>
    </footer>
  );
}
