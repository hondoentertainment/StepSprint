import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const envSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  DEFAULT_CHALLENGE_TZ: z.string().default("America/Chicago"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(", ");
  throw new Error(`Invalid environment: ${message}`);
}

export const config = {
  port: Number(parsed.data.PORT ?? "3001"),
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  appOrigin: parsed.data.APP_ORIGIN,
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
};
