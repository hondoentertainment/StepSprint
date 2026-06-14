import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "stepsprint_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const isTest = process.env.NODE_ENV === "test";

/** Pure validation used by csrfProtection and directly in tests. */
export function isCsrfValid(
  cookieToken: string | undefined,
  headerToken: string | string[] | undefined
): boolean {
  return (
    typeof cookieToken === "string" &&
    cookieToken.length > 0 &&
    typeof headerToken === "string" &&
    headerToken.length > 0 &&
    cookieToken === headerToken
  );
}

/**
 * Sets a non-httpOnly CSRF cookie on every response that doesn't already have
 * one. Browser JS reads the cookie and echoes it back as a header on mutating
 * requests; the server then validates header === cookie. This is the standard
 * double-submit cookie pattern and defends against cross-origin form posts.
 *
 * No-op in test mode so supertest suites can run without cookie plumbing.
 */
export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isTest) { next(); return; }
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  next();
}

/**
 * Rejects mutating requests whose X-CSRF-Token header doesn't match the
 * cookie. Safe methods (GET/HEAD/OPTIONS) pass through without checking.
 *
 * No-op in test mode so supertest suites can run without cookie plumbing.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isTest || SAFE_METHODS.has(req.method)) { next(); return; }
  const cookieToken = req.cookies[CSRF_COOKIE] as string | undefined;
  const headerToken = req.headers[CSRF_HEADER];
  if (!isCsrfValid(cookieToken, headerToken)) {
    res.status(403).json({ error: "CSRF token mismatch" });
    return;
  }
  next();
}
