import { config } from "./config";

const production = config.nodeEnv === "production";

/** HttpOnly session defaults that work split-origin (SPA on Vercel, API on Render) in prod. */
export const sessionCookieOptions = {
  httpOnly: true,
  path: "/" as const,
  sameSite: production ? ("none" as const) : ("lax" as const),
  secure: production,
  maxAge: 1000 * 60 * 60 * 24 * 30,
} as const;

/** Matches `clearCookie` to the shape browsers expect for SameSite=None removal. */
export const sessionCookieClearOptions = {
  path: "/" as const,
  sameSite: sessionCookieOptions.sameSite,
  secure: sessionCookieOptions.secure,
};
