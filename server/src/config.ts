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
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  FITBIT_CLIENT_ID: z.string().optional(),
  FITBIT_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(", ");
  throw new Error(`Invalid environment: ${message}`);
}

const smtpFrom = parsed.data.SMTP_FROM ?? "noreply@stepsprint.app";

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
  nodeEnv: parsed.data.NODE_ENV ?? "development",
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
  },
  reminderNotificationHourLocal:
    parsed.data.REMINDER_NOTIFICATION_HOUR_LOCAL ?? 17,
  emailTransportConfigured: Boolean(parsed.data.RESEND_API_KEY || parsed.data.SMTP_HOST),
};
