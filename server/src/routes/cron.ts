import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { config } from "../config";
import { logger } from "../logger";
import { Sentry, flushSentry } from "../sentry";
import { hourlyReminderSweep } from "../services/scheduler";

const router = Router();

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Exported for unit tests */
export function verifyReminderCronAuth(
  req: Pick<Request, "headers">,
  secret: string | undefined
): { ok: true } | { ok: false; status: number; error: string } {
  if (!secret) {
    return { ok: false, status: 503, error: "Reminder cron is not configured" };
  }

  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!timingSafeEqualString(token, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

async function runReminderSweep(req: Request, res: Response): Promise<void> {
  const check = verifyReminderCronAuth(req, config.cronSecret);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  try {
    await hourlyReminderSweep();
    res.json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err }, "Cron reminder sweep failed");
    // Capture explicitly because Vercel may freeze the function before
    // Sentry.setupExpressErrorHandler's auto-capture can flush.
    Sentry.captureException(err, { tags: { route: "cron.reminder-sweep" } });
    res.status(500).json({ error: "Sweep failed" });
  } finally {
    // On Vercel, calling flush before the handler returns guarantees the
    // captured event is delivered before the lambda is frozen.
    if (process.env.VERCEL) {
      await flushSentry();
    }
  }
}

/**
 * Platform cron: hourly sweep with `Authorization: Bearer <CRON_SECRET>`.
 * - **Vercel Cron** (canonical): GET; the bearer header is auto-populated from
 *   the `CRON_SECRET` project env var. See `vercel.json` `crons` entry.
 * - **GitHub Actions / curl / external schedulers**: either method works.
 * The legacy `REMINDER_CRON_SECRET` env name is still accepted server-side.
 * Prefer `REMINDER_USE_EXTERNAL_CRON=true` on multi-instance deploys so only this route runs the sweep.
 */
router.post("/reminder-sweep", runReminderSweep);
router.get("/reminder-sweep", runReminderSweep);

export default router;
