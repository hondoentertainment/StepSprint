import rateLimit from "express-rate-limit";

/** Rate limit for auth endpoints (login, etc.) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: "Too many requests, please try again later." },
});

/** General API rate limit (applied in production) */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  message: { error: "Too many requests, please try again later." },
});

/** Stricter rate limit for password reset requests */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many password reset requests. Please try again later." },
});
