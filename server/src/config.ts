import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const envSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().optional(),
  DEFAULT_CHALLENGE_TZ: z.string().default("America/Chicago"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  REMINDER_CRON: z.string().optional(),
  REMINDER_TZ: z.string().optional(),
  FITNESS_SYNC_CRON: z.string().optional(),
  FITNESS_SYNC_TZ: z.string().optional(),
  LOG_HTTP: z.enum(["0", "1"]).optional(),
  COMMIT_SHA: z.string().optional(),
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

const port = Number(parsed.data.PORT ?? "3001");

export const config = {
  port,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  appOrigin: parsed.data.APP_ORIGIN,
  apiPublicUrl: parsed.data.API_PUBLIC_URL ?? `http://localhost:${port}`,
  defaultChallengeTz: parsed.data.DEFAULT_CHALLENGE_TZ,
  cookieName: "stepsprint_session",
  smtp: parsed.data.SMTP_HOST
    ? {
        host: parsed.data.SMTP_HOST,
        port: Number(parsed.data.SMTP_PORT ?? "587"),
        user: parsed.data.SMTP_USER,
        pass: parsed.data.SMTP_PASS,
        from: parsed.data.SMTP_FROM ?? "noreply@stepsprint.local",
      }
    : null,
  reminderCron: parsed.data.REMINDER_CRON ?? "0 20 * * *",
  reminderTz: parsed.data.REMINDER_TZ ?? "America/Chicago",
  fitnessSyncCron: parsed.data.FITNESS_SYNC_CRON ?? "20 */4 * * *",
  fitnessSyncTz: parsed.data.FITNESS_SYNC_TZ ?? "Etc/UTC",
  logHttp: parsed.data.LOG_HTTP === "1",
  commitSha: parsed.data.COMMIT_SHA ?? null,
  fitbitClientId: parsed.data.FITBIT_CLIENT_ID ?? null,
  fitbitClientSecret: parsed.data.FITBIT_CLIENT_SECRET ?? null,
  googleClientId: parsed.data.GOOGLE_CLIENT_ID ?? null,
  googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET ?? null,
};
