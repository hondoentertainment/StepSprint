import rateLimit from "express-rate-limit";

/**
 * Disable rate limiting under test/E2E. The E2E suite drives a single
 * long-lived server process and logs in on every spec, which would otherwise
 * exhaust the auth limits and make later specs fail with 429. Unit tests run
 * each file in an isolated module registry, so they never relied on limiting.
 */
const skipInTest = () => process.env.NODE_ENV === "test";

/** Rate limit for auth endpoints (login, etc.) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: "Too many requests, please try again later." },
  skip: skipInTest,
});

/** Stricter limit for login / resend-verification to slow credential stuffing. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many attempts. Please try again later." },
  skip: skipInTest,
});

/** Limit for authenticated integration sync endpoints (Fitbit/Google/Garmin). */
export const integrationSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60,
  message: { error: "Too many sync requests. Please try again later." },
  skip: skipInTest,
});

const isProduction = process.env.NODE_ENV === "production";

/** General API rate limit (stricter in production) */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isProduction ? 120 : 2000,
  message: { error: "Too many requests, please try again later." },
  skip: skipInTest,
});

/** Stricter rate limit for password reset requests */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many password reset requests. Please try again later." },
  skip: skipInTest,
});
