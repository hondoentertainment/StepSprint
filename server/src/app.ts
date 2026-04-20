// CSRF decision: the API is primarily consumed from the first-party SPA via
// an httpOnly session cookie (see routes/auth.ts). That makes CSRF relevant
// for browser clients. The `authRequired` middleware also accepts an
// `Authorization: Bearer` token, which is not automatically attached by the
// browser and therefore is not CSRF-vulnerable. We defer wiring csrf-csrf /
// double-submit cookies to a follow-up change that also updates the SPA's
// api.ts to fetch and forward the CSRF token; see the TODO below and the
// companion hardening plan. This file documents the decision so a future
// reader does not think CSRF was simply overlooked.
//
// TODO(security): add csrf-csrf double-submit tokens on mutating routes and
// expose GET /api/csrf-token once the client is ready to forward the header.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { authLimiter, apiLimiter } from "./middleware/rateLimit";
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

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Mount helmet very early so every response (including errors from later
// middleware) gets baseline security headers: x-content-type-options,
// x-frame-options, strict-transport-security (in prod via HTTPS),
// referrer-policy, etc. Content-Security-Policy is intentionally left at
// helmet's default until we pin down an actual policy for the SPA's inline
// styles / asset origins — tightening CSP without testing the frontend would
// break the app. Track that as a follow-up.
app.use(helmet());

if (isProduction) {
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

app.get("/api/health", (_req, res) => {
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

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
