import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { config } from "../config";
import { isPushEnabled } from "../services/push";

const router = Router();

/** Get notification preferences */
router.get("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? "";
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  res.json({
    dailyReminder: pref?.dailyReminder ?? false,
    streakAtRiskReminder: pref?.streakAtRiskReminder ?? false,
  });
});

/** Update notification preferences */
router.patch("/preferences", authRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({
      dailyReminder: z.boolean().optional(),
      streakAtRiskReminder: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const userId = req.user?.id ?? "";
  const updated = await prisma.notificationPreference.upsert({
    where: { userId },
    update: { ...parsed.data },
    create: {
      userId,
      dailyReminder: parsed.data.dailyReminder ?? false,
      streakAtRiskReminder: parsed.data.streakAtRiskReminder ?? false,
    },
  });

  res.json({
    dailyReminder: updated.dailyReminder,
    streakAtRiskReminder: updated.streakAtRiskReminder,
  });
});

/**
 * Returns the server-side VAPID public key that a browser needs to call
 * `pushManager.subscribe({ applicationServerKey })`. Returns `null` when
 * push is not configured so the client can gracefully hide the UI.
 */
router.get(
  "/push/public-key",
  authRequired,
  async (_req: AuthenticatedRequest, res) => {
    if (!isPushEnabled() || !config.vapid.publicKey) {
      res.json({ key: null });
      return;
    }
    res.json({ key: config.vapid.publicKey });
  }
);

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Persist a browser push subscription for the current user. Uses endpoint
 * as the natural key so repeated subscribe calls (e.g. after a key
 * rotation) update the existing row rather than duplicating it.
 */
router.post(
  "/push/subscribe",
  authRequired,
  async (req: AuthenticatedRequest, res) => {
    const parsed = pushSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const userId = req.user?.id ?? "";
    const { endpoint, keys } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    res.status(204).end();
  }
);

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/** Remove a stored push subscription for the current user. */
router.delete(
  "/push/subscribe",
  authRequired,
  async (req: AuthenticatedRequest, res) => {
    const parsed = pushUnsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const userId = req.user?.id ?? "";
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId },
    });

    res.status(204).end();
  }
);

export default router;
