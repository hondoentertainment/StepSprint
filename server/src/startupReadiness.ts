import { config } from "./config";
import { logger } from "./logger";

/**
 * Non-fatal production warnings for optional integrations.
 * Required env (Postgres URL, JWT length, email transport) is enforced in `config.ts` except under Vitest.
 */
export function logProductionReadiness(): void {
  if (config.nodeEnv !== "production") return;
  if (process.env.VITEST === "true") return;

  if (config.databaseUrl.startsWith("file:")) {
    logger.warn(
      "DATABASE_URL points to SQLite (file:). Production should use PostgreSQL with managed backups."
    );
  }

  if (config.allowProductionWithoutEmail && !config.emailTransportConfigured) {
    logger.warn(
      "ALLOW_PRODUCTION_WITHOUT_EMAIL=true with no RESEND_API_KEY or SMTP_HOST — verification and password reset emails will not send.",
    );
  }

  if (!config.sentryDsn) {
    logger.warn("SENTRY_DSN is unset — server exceptions will not be sent to Sentry.");
  }

  if (config.reminderUseExternalCron && !config.reminderCronSecret) {
    logger.warn(
      "REMINDER_USE_EXTERNAL_CRON is true but REMINDER_CRON_SECRET is unset — POST /api/cron/reminder-sweep will return 503."
    );
  }

  if (!config.reminderUseExternalCron) {
    logger.warn(
      "In-process hourly reminder scheduler is enabled. For multiple API instances set REMINDER_USE_EXTERNAL_CRON=true and run POST /api/cron/reminder-sweep from a platform cron (see docs/DEPLOYMENT.md)."
    );
  }

  if (config.allowVercelPreviewOrigins) {
    logger.warn(
      "APP_ALLOW_VERCEL_PREVIEW_ORIGINS=true: any https://*.vercel.app origin may call this API with credentials. Intended for staging/preview APIs only."
    );
  }

  const { oauth } = config;
  const fitbitOk = Boolean(oauth.fitbitClientId && oauth.fitbitClientSecret);
  const googleOk = Boolean(oauth.googleClientId && oauth.googleClientSecret);
  const garminOk = Boolean(oauth.garminClientId && oauth.garminClientSecret);
  const partial = (
    name: string,
    id: string | undefined,
    secret: string | undefined
  ): void => {
    const hasId = Boolean(id?.trim());
    const hasSecret = Boolean(secret?.trim());
    if (hasId !== hasSecret) {
      logger.warn(
        { provider: name },
        "OAuth client id and secret must both be set or both omitted — integration is disabled until fixed."
      );
    }
  };
  partial("Fitbit", oauth.fitbitClientId, oauth.fitbitClientSecret);
  partial("Google Fit", oauth.googleClientId, oauth.googleClientSecret);
  partial("Garmin", oauth.garminClientId, oauth.garminClientSecret);

  if (fitbitOk || googleOk || garminOk) {
    logger.info(
      {
        apiPublicOrigin: config.apiPublicOrigin,
        appOrigin: config.appOrigin,
      },
      "OAuth enabled: register redirect URIs on apiPublicOrigin (see .env.example)."
    );
  }
  if (config.apiPublicOrigin !== config.appOrigin) {
    logger.info(
      "Split hosting: use apiPublicOrigin for OAuth redirect URIs and for VITE_API_URL when building the SPA (Apple Shortcuts use the same API base)."
    );
  }

  logger.info(
    { shortcutsPostUrl: `${config.apiPublicOrigin}/api/integrations/apple-health` },
    "Apple Health / Watch (Shortcuts): build the SPA with VITE_API_URL pointing at this API base so the Devices page shows the correct POST URL."
  );
}
