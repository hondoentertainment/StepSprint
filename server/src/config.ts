import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().optional(),
  DEFAULT_CHALLENGE_TZ: z.string().default("America/Chicago"),
  SENTRY_DSN: z.string().optional(),
  DEPLOYMENT_RELEASE: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALLOW_PRODUCTION_WITHOUT_EMAIL: z.string().optional(),
  REMINDER_CRON: z.string().optional(),
  REMINDER_TZ: z.string().optional(),
  REMINDER_NOTIFICATION_HOUR_LOCAL: z.string().optional(),
  REMINDER_USE_EXTERNAL_CRON: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  REMINDER_CRON_SECRET: z.string().optional(),
  FITNESS_SYNC_CRON: z.string().optional(),
  FITNESS_SYNC_TZ: z.string().optional(),
  LOG_HTTP: z.enum(["0", "1"]).optional(),
  COMMIT_SHA: z.string().optional(),
  APP_ALLOW_VERCEL_PREVIEW_ORIGINS: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  FITBIT_CLIENT_ID: z.string().optional(),
  FITBIT_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GARMIN_CLIENT_ID: z.string().optional(),
  GARMIN_CLIENT_SECRET: z.string().optional(),
  GARMIN_OAUTH_SCOPE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(", ");
  throw new Error(`Invalid environment: ${message}`);
}

const env = parsed.data;
const port = Number(env.PORT ?? "3001");
const apiPublicOrigin = (env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/u, "");

const isTruthy = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

const emailTransportConfigured = Boolean(env.RESEND_API_KEY || env.SMTP_HOST);

const reminderHour = Number(env.REMINDER_NOTIFICATION_HOUR_LOCAL ?? "17");

export const config = {
  port,
  nodeEnv: env.NODE_ENV ?? "development",
  sentryDsn: env.SENTRY_DSN ?? null,
  deploymentRelease: env.DEPLOYMENT_RELEASE ?? env.COMMIT_SHA ?? undefined,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  appOrigin: env.APP_ORIGIN,
  apiPublicUrl: apiPublicOrigin,
  apiPublicOrigin,
  defaultChallengeTz: env.DEFAULT_CHALLENGE_TZ,
  cookieName: "stepsprint_session",
  resendApiKey: env.RESEND_API_KEY ?? undefined,
  emailFrom: env.EMAIL_FROM ?? env.SMTP_FROM ?? "StepSprint <noreply@stepsprint.local>",
  emailTransportConfigured,
  allowProductionWithoutEmail: isTruthy(env.ALLOW_PRODUCTION_WITHOUT_EMAIL),
  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? "587"),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM ?? "noreply@stepsprint.local",
      }
    : null,
  reminderCron: env.REMINDER_CRON ?? "0 20 * * *",
  reminderTz: env.REMINDER_TZ ?? "America/Chicago",
  reminderNotificationHourLocal: Number.isFinite(reminderHour) ? reminderHour : 17,
  reminderUseExternalCron: isTruthy(env.REMINDER_USE_EXTERNAL_CRON),
  cronSecret: env.CRON_SECRET ?? env.REMINDER_CRON_SECRET ?? undefined,
  fitnessSyncCron: env.FITNESS_SYNC_CRON ?? "20 */4 * * *",
  fitnessSyncTz: env.FITNESS_SYNC_TZ ?? "Etc/UTC",
  logHttp: env.LOG_HTTP === "1",
  commitSha: env.COMMIT_SHA ?? null,
  allowVercelPreviewOrigins: isTruthy(env.APP_ALLOW_VERCEL_PREVIEW_ORIGINS),
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY ?? undefined,
    privateKey: env.VAPID_PRIVATE_KEY ?? undefined,
    subject: env.VAPID_SUBJECT ?? undefined,
  },
  fitbitClientId: env.FITBIT_CLIENT_ID ?? null,
  fitbitClientSecret: env.FITBIT_CLIENT_SECRET ?? null,
  googleClientId: env.GOOGLE_CLIENT_ID ?? null,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? null,
  oauth: {
    fitbitClientId: env.FITBIT_CLIENT_ID ?? undefined,
    fitbitClientSecret: env.FITBIT_CLIENT_SECRET ?? undefined,
    googleClientId: env.GOOGLE_CLIENT_ID ?? undefined,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? undefined,
    garminClientId: env.GARMIN_CLIENT_ID ?? undefined,
    garminClientSecret: env.GARMIN_CLIENT_SECRET ?? undefined,
    garminOAuthScope: env.GARMIN_OAUTH_SCOPE ?? undefined,
  },
};
