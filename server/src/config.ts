import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

// ---------------------------------------------------------------------------
// Vercel Postgres compatibility
// ---------------------------------------------------------------------------
// The Vercel Postgres integration auto-injects POSTGRES_PRISMA_URL (pooled,
// safe for the app at runtime) and POSTGRES_URL_NON_POOLING (direct, used by
// `prisma migrate deploy` during builds). Map them onto Prisma's expected env
// names so the schema can keep using DATABASE_URL / DIRECT_URL unchanged and
// no operator-side env aliasing is required.
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
  process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
}

const envSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  /** Direct (non-pooled) URL used by `prisma migrate deploy`. Optional locally; required when DATABASE_URL points at a pooler (Vercel Postgres / Neon). */
  DIRECT_URL: z.string().optional(),
  /** Auto-injected by the Vercel Postgres integration. Mapped to DATABASE_URL above when DATABASE_URL is unset. */
  POSTGRES_PRISMA_URL: z.string().optional(),
  /** Auto-injected by the Vercel Postgres integration. Mapped to DIRECT_URL above when DIRECT_URL is unset. */
  POSTGRES_URL_NON_POOLING: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  /** Comma-separated extra browser origins allowed for CORS (custom domains, staging). Must match the full Origin header (e.g. https://www.example.com). */
  APP_ORIGIN_ALLOWLIST: z.string().optional(),
  /**
   * When `true`, allows `https://*.vercel.app` origins for CORS (Vercel preview deployments).
   * Use on staging/preview API instances; avoid on production unless you accept any Vercel preview talking to this API.
   */
  APP_ALLOW_VERCEL_PREVIEW_ORIGINS: z.enum(["true", "false"]).optional(),
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
  /**
   * Bearer token for POST/GET /api/cron/reminder-sweep. Min 16 chars.
   * Vercel Cron auto-populates this header from a project env var named
   * `CRON_SECRET`, so that's the canonical name. We also accept the legacy
   * `REMINDER_CRON_SECRET` so existing deploys keep working.
   */
  CRON_SECRET: z.string().min(16).optional(),
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
  /**
   * When `true`, allow `NODE_ENV=production` without RESEND_API_KEY or SMTP_HOST.
   * Use only for non-user-facing or emergency bring-up; registration and password reset need email.
   */
  ALLOW_PRODUCTION_WITHOUT_EMAIL: z.enum(["true", "false"]).optional(),
});

const envSchemaWithRefinements = envSchema.superRefine((data, ctx) => {
  const nodeEnv = data.NODE_ENV ?? "development";
  /** Vitest sets `VITEST` so production-like tests can load SQLite + short secrets. Real deploys must not set this. */
  const skipStrictProduction = process.env.VITEST === "true";

  /** Either CRON_SECRET (Vercel convention) or legacy REMINDER_CRON_SECRET satisfies the check. */
  const cronSecret = data.CRON_SECRET ?? data.REMINDER_CRON_SECRET;
  const cronSecretValid = Boolean(cronSecret && cronSecret.length >= 16);
  if (
    nodeEnv === "production" &&
    data.REMINDER_USE_EXTERNAL_CRON === "true" &&
    !cronSecretValid
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CRON_SECRET"],
      message:
        "CRON_SECRET (min 16 chars) is required when REMINDER_USE_EXTERNAL_CRON=true in production. Vercel Cron uses this name; REMINDER_CRON_SECRET is also accepted for backwards compatibility.",
    });
  }

  if (nodeEnv === "production" && !skipStrictProduction) {
    if (data.DATABASE_URL.startsWith("file:")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "DATABASE_URL must be a PostgreSQL URL in production (SQLite file: URLs are not supported)",
      });
    }
    const origin = data.APP_ORIGIN.trim().replace(/\/$/, "");
    const isLoopbackOrigin =
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
    if (isLoopbackOrigin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ORIGIN"],
        message:
          "APP_ORIGIN must be your real SPA URL in production, not localhost or loopback",
      });
    }
    if (data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message:
          "JWT_SECRET must be at least 32 characters in production (generate with strong random bytes)",
      });
    }

    const hasEmailTransport = Boolean(data.RESEND_API_KEY?.trim() || data.SMTP_HOST?.trim());
    const allowNoEmail = data.ALLOW_PRODUCTION_WITHOUT_EMAIL === "true";
    if (!hasEmailTransport && !allowNoEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message:
          "Production requires RESEND_API_KEY or SMTP_HOST (transactional email). Set ALLOW_PRODUCTION_WITHOUT_EMAIL=true only for non-public or temporary APIs.",
      });
    }
    if (hasEmailTransport && !data.SMTP_FROM?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_FROM"],
        message:
          "SMTP_FROM is required in production when RESEND_API_KEY or SMTP_HOST is set (use a verified sender domain).",
      });
    }
  }
});

const parsed = envSchemaWithRefinements.safeParse(process.env);
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

function parseCommaOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((s) => s.length > 0);
}

const appOriginAllowlist = parseCommaOrigins(parsed.data.APP_ORIGIN_ALLOWLIST);
const allowVercelPreviewOrigins = parsed.data.APP_ALLOW_VERCEL_PREVIEW_ORIGINS === "true";

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
  /** Extra allowed CORS origins (full scheme + host, no trailing slash). */
  appOriginAllowlist,
  /** When true, allow any `https://<subdomain>.vercel.app` Origin for CORS. */
  allowVercelPreviewOrigins,
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
  /**
   * Bearer secret accepted by /api/cron/reminder-sweep.
   * Vercel Cron auto-fills the Authorization header from `CRON_SECRET`;
   * the legacy `REMINDER_CRON_SECRET` is still accepted so existing platform
   * cron schedules keep working without a flag day.
   */
  cronSecret: parsed.data.CRON_SECRET ?? parsed.data.REMINDER_CRON_SECRET,
  emailTransportConfigured: Boolean(parsed.data.RESEND_API_KEY || parsed.data.SMTP_HOST),
  /** Escape hatch: production boot without Resend/SMTP (not for public launches). */
  allowProductionWithoutEmail: parsed.data.ALLOW_PRODUCTION_WITHOUT_EMAIL === "true",
  /** Release string for Sentry and optional health payload */
  deploymentRelease,
};
