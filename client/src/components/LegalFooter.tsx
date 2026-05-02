import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function LegalFooter() {
  const { t } = useTranslation();
  return (
    <footer className="legal-footer" role="contentinfo">
      <Link to="/privacy">{t("legal.privacy")}</Link>
      <span aria-hidden> · </span>
      <Link to="/terms">{t("legal.terms")}</Link>
    </footer>
  );
}
