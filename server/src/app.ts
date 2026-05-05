import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors, { type CorsOptions } from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { doubleCsrf } from "csrf-csrf";
import * as Sentry from "@sentry/node";
import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./prisma";
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
import cronRoutes from "./routes/cron";

const app = express();
const isProduction = config.nodeEnv === "production";

if (isProduction) {
  // Reverse-proxy (Render, etc.) — correct client IP for rate limits, cookies, CSRF session id.
  app.set("trust proxy", 1);
}

/** Matches Vercel preview / project URLs (`https://<slug>.vercel.app`). */
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === config.appOrigin) return true;
  if (config.appOriginAllowlist.includes(origin)) return true;
  if (
    config.allowVercelPreviewOrigins &&
    VERCEL_PREVIEW_ORIGIN.test(origin)
  ) {
    return true;
  }
  return false;
}

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
};

// ---------------------------------------------------------------------------
// Security headers (helmet + pinned CSP)
// ---------------------------------------------------------------------------
// The API is consumed by the first-party SPA (strict policy) and the Swagger
// UI at /api/docs (relaxed policy — Swagger requires cdn.jsdelivr.net + inline).
// We apply the strict policy globally and override only the docs route.

const strictCsp = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
});

const swaggerCsp = helmet({
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
});

app.use((req, res, next) => {
  const openApiPath =
    config.openApiDocsEnabled &&
    (req.path.startsWith("/api/docs") || req.path === "/api/openapi.json");
  if (openApiPath) {
    return swaggerCsp(req, res, next);
  }
  return strictCsp(req, res, next);
});

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
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// CSRF — double-submit cookie pattern (production only)
// ---------------------------------------------------------------------------
// The auth middleware also accepts Authorization: Bearer tokens, which are
// not auto-sent by the browser and therefore not CSRF-vulnerable. We skip
// CSRF validation for those requests so iOS Shortcuts / OAuth flows continue
// to work without a CSRF token.
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.jwtSecret,
  getSessionIdentifier: (req) =>
    (req.cookies?.["stepsprint.csrf"] as string | undefined) ?? req.ip ?? "anon",
  cookieName: "stepsprint.csrf",
  cookieOptions: {
    // Match session cookies so split-hosting (Vercel + Render) receives the CSRF pair.
    sameSite: isProduction ? ("none" as const) : "lax",
    httpOnly: true,
    secure: isProduction,
    path: "/",
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => {
    const h = req.headers["x-csrf-token"];
    return typeof h === "string" ? h : undefined;
  },
});

// Expose a token endpoint that the SPA calls on startup.
// Must be registered BEFORE the CSRF protection middleware.
app.get("/api/csrf-token", (req, res) => {
  res.json({ token: generateCsrfToken(req as Request, res) });
});

function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Bearer-authenticated requests originate from non-browser clients (iOS
  // Shortcuts, server-to-server) and are not CSRF-vulnerable.
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return next();
  }
  // These POSTs carry a secret token in the body (from email links). Users often
  // open them without a prior API visit, so a CSRF cookie may not exist yet on
  // split-hosting — same threat model as Bearer: attacker needs the token.
  const pathOnly = req.originalUrl.split("?")[0];
  if (
    req.method === "POST" &&
    (pathOnly === "/api/auth/reset-password" || pathOnly === "/api/auth/verify-email")
  ) {
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
app.get("/api/health", async (_req, res) => {
  const transactionalEmailProd =
    config.nodeEnv === "production"
      ? config.emailTransportConfigured
        ? ("configured" as const)
        : ("allow_without_flag" as const)
      : undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    const body: {
      ok: true;
      db: "up";
      service: string;
      release?: string;
      transactionalEmail?: "configured" | "allow_without_flag";
    } = {
      ok: true,
      db: "up",
      service: "stepsprint-api",
    };
    if (config.deploymentRelease) {
      body.release = config.deploymentRelease;
    }
    if (transactionalEmailProd !== undefined) {
      body.transactionalEmail = transactionalEmailProd;
    }
    res.json(body);
  } catch {
    res.status(503).json({
      ok: false,
      db: "down" as const,
      service: "stepsprint-api",
      ...(config.deploymentRelease ? { release: config.deploymentRelease } : {}),
      ...(transactionalEmailProd !== undefined
        ? { transactionalEmail: transactionalEmailProd }
        : {}),
    });
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/cron", cronRoutes);
app.use("/api/auth", ...(isProduction ? [authLimiter] : []), authRoutes);
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
if (config.openApiDocsEnabled) {
  app.use("/api", openapiRoutes);
}

// Sentry must be attached AFTER all routes and BEFORE any custom error handler.
Sentry.setupExpressErrorHandler(app);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
