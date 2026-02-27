import { Router } from "express";
import { z } from "zod";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// In-memory stub (replace with DB/cache in production)
const prefs = new Map<string, { dailyReminder: boolean }>();

/** Get notification preferences */
router.get("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? "";
  const userPrefs = prefs.get(userId) ?? { dailyReminder: false };
  res.json(userPrefs);
});

/** Update notification preferences */
router.patch("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ dailyReminder: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const userId = req.user?.id ?? "";
  const current = prefs.get(userId) ?? { dailyReminder: false };
  const updated = { ...current, ...parsed.data };
  prefs.set(userId, updated);

  res.json(updated);
});

export default router;
