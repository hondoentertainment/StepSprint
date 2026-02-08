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
  DEFAULT_CHALLENGE_TZ: z.string().default("America/Chicago"),
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
};
