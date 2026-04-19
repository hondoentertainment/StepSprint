import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./logger";
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

app.use(
  pinoHttp({
    logger,
    // `genReqId` is built-in; explicitly enabling it guarantees a request id
    // is attached to each request's logger even if upstream does not send one.
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
