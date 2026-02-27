import { Router } from "express";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

/** Fitness integration status (stub for future Google Fit, Apple Health, Fitbit) */
router.get("/fitness", authRequired, async (_req: AuthenticatedRequest, res) => {
  res.json({
    connected: false,
    providers: [
      { id: "google_fit", name: "Google Fit", available: false },
      { id: "apple_health", name: "Apple Health", available: false },
      { id: "fitbit", name: "Fitbit", available: false },
    ],
    message: "Fitness integrations coming soon. For now, log steps manually.",
  });
});

export default router;
