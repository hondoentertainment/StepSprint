import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";
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
import openapiRoutes from "./routes/openapi";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

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
app.use("/api", openapiRoutes);

// Sentry must be attached AFTER all routes and BEFORE any custom error
// handler so uncaught route errors flow into Sentry first.
// Safe no-op when SENTRY_DSN is unset.
Sentry.setupExpressErrorHandler(app);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
