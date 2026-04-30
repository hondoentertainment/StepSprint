import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { doubleCsrf } from "csrf-csrf";
import * as Sentry from "@sentry/node";
import { config } from "./config";
import { logger } from "./logger";
import { authLimiter, apiLimiter, generalLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import challengeRoutes from "./routes/challenges";
import submissionRoutes from "./routes/submissions";
import leaderboardRoutes from "./routes/leaderboards";
import summaryRoutes from "./routes/summary";
import inviteRoutes from "./routes/invites";
import analyticsRoutes from "./routes/analytics";
import integrationsRoutes from "./routes/integrations";
import oauthRoutes from "./routes/oauth";
import notificationsRoutes from "./routes/notifications";
import openapiRoutes from "./routes/openapi";

const app = express();
const isProduction = config.nodeEnv === "production";

// ---------------------------------------------------------------------------
// Security headers (helmet + pinned CSP)
// ---------------------------------------------------------------------------
// The API is consumed by the first-party SPA and the Swagger UI at /api/docs.
// Swagger UI loads assets from cdn.jsdelivr.net; everything else is self-hosted.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        styleSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  })
);

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers["x-request-id"];
      if (typeof existing === "string" && existing.length > 0) {
        res.setHeader("x-request-id", existing);
        return existing;
      }
      const id = crypto.randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
  })
);

// ---------------------------------------------------------------------------
// Rate limiting (production only)
// ---------------------------------------------------------------------------
if (isProduction) {
  app.use(generalLimiter);
  app.use("/api", apiLimiter);
}

// ---------------------------------------------------------------------------
// CORS + body parsing
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: config.appOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// CSRF — double-submit cookie pattern (production only)
// ---------------------------------------------------------------------------
// The auth middleware also accepts Authorization: Bearer tokens, which are
// not auto-sent by the browser and therefore not CSRF-vulnerable. We skip
// CSRF validation for those requests so iOS Shortcuts / OAuth flows continue
// to work without a CSRF token.
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.jwtSecret,
  cookieName: "stepsprint.csrf",
  cookieOptions: {
    sameSite: "lax",
    httpOnly: true,
    secure: isProduction,
    path: "/",
  },
  size: 64,
  getTokenFromRequest: (req) => {
    const h = req.headers["x-csrf-token"];
    return typeof h === "string" ? h : undefined;
  },
});

// Expose a token endpoint that the SPA calls on startup.
// Must be registered BEFORE the CSRF protection middleware.
app.get("/api/csrf-token", (req, res) => {
  res.json({ token: generateToken(req as Request, res) });
});

function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Bearer-authenticated requests originate from non-browser clients (iOS
  // Shortcuts, server-to-server) and are not CSRF-vulnerable.
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
}

if (isProduction) {
  app.use("/api", csrfProtection);
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/leaderboards", leaderboardRoutes);
app.use("/api/me/summary", summaryRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/integrations", oauthRoutes);
app.use("/api/me/notifications", notificationsRoutes);
app.use("/api", openapiRoutes);

// Sentry must be attached AFTER all routes and BEFORE any custom error handler.
Sentry.setupExpressErrorHandler(app);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
