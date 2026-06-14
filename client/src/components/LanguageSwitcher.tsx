import { useTranslation } from "react-i18next";
import { LOCALE_STORAGE_KEY } from "../i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";

  return (
    <footer className="language-switcher" role="contentinfo">
      <label className="language-switcher-label">
        <span className="sr-only">{t("layout.languageSelectAria")}</span>
        <select
          className="language-switcher-select"
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
    </footer>
  );
}
