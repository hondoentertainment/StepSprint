import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

/** Get notification preferences */
router.get("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? "";
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  res.json({ dailyReminder: pref?.dailyReminder ?? false });
});

/** Update notification preferences */
router.patch("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ dailyReminder: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const userId = req.user?.id ?? "";
  const updated = await prisma.notificationPreference.upsert({
    where: { userId },
    update: { ...parsed.data },
    create: { userId, dailyReminder: parsed.data.dailyReminder ?? false },
  });

  res.json({ dailyReminder: updated.dailyReminder });
});

export default router;
