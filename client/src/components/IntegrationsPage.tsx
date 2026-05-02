import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FitnessIntegrations } from "./FitnessIntegrations";

type Props = {
  challengeId: string;
  challengesLoading: boolean;
};

export function IntegrationsPage({ challengeId, challengesLoading }: Props) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <h2>{t("integrations.title")}</h2>
      <p className="hint">{t("integrations.subtitle")}</p>
      {!challengeId && !challengesLoading && (
        <p className="status status-error" role="alert">
          {t("integrations.noChallenge")}
        </p>
      )}
      {challengeId && <FitnessIntegrations challengeId={challengeId} />}
      <p className="hint" style={{ marginTop: "1.25rem" }}>
        <Link to="/submit">{t("integrations.backToSubmit")}</Link>
      </p>
    </section>
  );
}
