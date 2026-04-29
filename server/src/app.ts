import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import { config } from "./config";
import { logger } from "./logger";
import { authLimiter, apiLimiter, generalLimiter } from "./middleware/rateLimit";
import { csrfCookieMiddleware, csrfProtection } from "./middleware/csrf";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import challengeRoutes from "./routes/challenges";
import submissionRoutes from "./routes/submissions";
import leaderboardRoutes from "./routes/leaderboards";
import summaryRoutes from "./routes/summary";
import inviteRoutes from "./routes/invites";
import analyticsRoutes from "./routes/analytics";
import integrationsRoutes from "./routes/integrations";
import notificationsRoutes from "./routes/notifications";
import openapiRoutes from "./routes/openapi";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Mount helmet early so every response gets protective headers. CSP is
// configured to lock down the API server; the Swagger UI at /api/docs needs
// 'unsafe-inline' for its bundled scripts and styles but everything else
// is tightly scoped to 'self'.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

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

if (isProduction) {
  app.use(generalLimiter);
  app.use("/api", apiLimiter);
}

app.use(
  cors({
    origin: config.appOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(csrfCookieMiddleware);
app.use(csrfProtection);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/** Returns the current CSRF token so the SPA can prime the cookie on boot. */
app.get("/api/csrf-token", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/leaderboards", leaderboardRoutes);
app.use("/api/me/summary", summaryRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/me/notifications", notificationsRoutes);
app.use("/api", openapiRoutes);

// Sentry must be attached AFTER all routes and BEFORE any custom error
// handler so uncaught route errors flow into Sentry first.
// Safe no-op when SENTRY_DSN is unset.
Sentry.setupExpressErrorHandler(app);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
