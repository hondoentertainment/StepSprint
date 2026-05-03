import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const envSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  JWT_SECRET: z.string().min(16),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  DEFAULT_CHALLENGE_TZ: z.string().default("America/Chicago"),
  // Resend transactional email (preferred). Falls back to raw SMTP when absent.
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NODE_ENV: z.string().optional(),
  /** Public origin of this API (e.g. Render URL). Used for OAuth redirect_uri when the SPA runs on another origin. Defaults to APP_ORIGIN (same-origin / Vite proxy). */
  API_PUBLIC_ORIGIN: z.string().optional(),
  REMINDER_NOTIFICATION_HOUR_LOCAL: z.coerce.number().int().min(0).max(23).optional(),
  /** When `true`, disables the in-process hourly reminder loop (use POST /api/cron/reminder-sweep from a platform cron instead). */
  REMINDER_USE_EXTERNAL_CRON: z.string().optional(),
  /** Minimum 16 chars. Bearer token for POST /api/cron/reminder-sweep (Authorization: Bearer …). */
  REMINDER_CRON_SECRET: z.string().min(16).optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  FITBIT_CLIENT_ID: z.string().optional(),
  FITBIT_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Garmin Connect Developer Program (OAuth 2.0 + PKCE + confidential client exchange). Wellness API scopes are assigned in the Garmin app registration. */
  GARMIN_CLIENT_ID: z.string().optional(),
  GARMIN_CLIENT_SECRET: z.string().optional(),
  /** Optional Garmin authorize `scope` (space-separated per Garmin app registration). Omit if your app preset handles scopes without this parameter. */
  GARMIN_OAUTH_SCOPE: z.string().optional(),
  /** When `true`, expose Swagger UI at /api/docs and /api/openapi.json. Defaults off in production. */
  OPENAPI_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
  /** Optional release string for Sentry and /api/health (e.g. stepsprint-api@abc1234). */
  SENTRY_RELEASE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(", ");
  throw new Error(`Invalid environment: ${message}`);
}

const smtpFrom = parsed.data.SMTP_FROM ?? "noreply@stepsprint.app";

const nodeEnv = parsed.data.NODE_ENV ?? "development";

/** Resolve a release identifier for observability (Sentry, health JSON). */
function resolveDeploymentRelease(explicit?: string): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const candidates = [
    process.env.RENDER_GIT_COMMIT,
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.COMMIT_REF,
  ];
  for (const c of candidates) {
    const sha = c?.trim();
    if (sha) return `stepsprint-api@${sha.slice(0, 7)}`;
  }
  return undefined;
}

const deploymentRelease = resolveDeploymentRelease(parsed.data.SENTRY_RELEASE);

const openApiDocsEnabled =
  parsed.data.OPENAPI_DOCS_ENABLED === "true"
    ? true
    : parsed.data.OPENAPI_DOCS_ENABLED === "false"
      ? false
      : nodeEnv !== "production";

export const config = {
  port: Number(parsed.data.PORT ?? "3001"),
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  appOrigin: parsed.data.APP_ORIGIN.replace(/\/$/, ""),
  /** Canonical base URL where this Express app is reachable (trailing slashes stripped). OAuth callbacks must use this in production split-hosting. */
  apiPublicOrigin:
    (parsed.data.API_PUBLIC_ORIGIN ?? parsed.data.APP_ORIGIN).replace(/\/$/, ""),
  defaultChallengeTz: parsed.data.DEFAULT_CHALLENGE_TZ,
  cookieName: "stepsprint_session",
  sentryDsn: parsed.data.SENTRY_DSN,
  nodeEnv,
  openApiDocsEnabled,
  resendApiKey: parsed.data.RESEND_API_KEY,
  emailFrom: smtpFrom,
  vapid: {
    publicKey: parsed.data.VAPID_PUBLIC_KEY,
    privateKey: parsed.data.VAPID_PRIVATE_KEY,
    subject: parsed.data.VAPID_SUBJECT ?? `mailto:${smtpFrom}`,
  },
  smtp: parsed.data.SMTP_HOST
    ? {
        host: parsed.data.SMTP_HOST,
        port: Number(parsed.data.SMTP_PORT ?? "587"),
        user: parsed.data.SMTP_USER,
        pass: parsed.data.SMTP_PASS,
        from: smtpFrom,
      }
    : null,
  oauth: {
    fitbitClientId: parsed.data.FITBIT_CLIENT_ID,
    fitbitClientSecret: parsed.data.FITBIT_CLIENT_SECRET,
    googleClientId: parsed.data.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
    garminClientId: parsed.data.GARMIN_CLIENT_ID,
    garminClientSecret: parsed.data.GARMIN_CLIENT_SECRET,
    garminOAuthScope: parsed.data.GARMIN_OAUTH_SCOPE?.trim(),
  },
  reminderNotificationHourLocal:
    parsed.data.REMINDER_NOTIFICATION_HOUR_LOCAL ?? 17,
  reminderUseExternalCron: parsed.data.REMINDER_USE_EXTERNAL_CRON === "true",
  reminderCronSecret: parsed.data.REMINDER_CRON_SECRET,
  emailTransportConfigured: Boolean(parsed.data.RESEND_API_KEY || parsed.data.SMTP_HOST),
  /** Release string for Sentry and optional health payload */
  deploymentRelease,
};
