import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { isPushEnabled, sendPush } from "./push";
import { logger } from "../logger";
import { sendEmail } from "./email";
import { config } from "../config";
import { getTodayRange, getYesterdayRange } from "../utils/dates";

const HOURLY_MS = 60 * 60 * 1000;
const MIN_HOURS_BETWEEN_REMINDERS = 22;

function emailConfigured(): boolean {
  return config.emailTransportConfigured;
}

type ActionableChallenge = {
  name: string;
  streakRisk: boolean;
};

/**
 * For opted-in users, send at most once per throttle window when it is the
 * configured local reminder hour and at least one enrolled challenge lacks
 * a submission for today in that challenge timezone.
 */
export async function hourlyReminderSweep(): Promise<void> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { dailyReminder: true },
    include: {
      user: {
        include: {
          pushSubscriptions: true,
          memberships: { include: { challenge: true } },
        },
      },
    },
  });

  let pushAttempts = 0;
  let pushFailures = 0;
  let emailsSent = 0;
  let usersThrottled = 0;
  let usersNotified = 0;
  const staleEndpoints: string[] = [];

  const nowUtc = DateTime.utc();

  for (const pref of prefs) {
    const { user } = pref;

    const throttleDeadline = pref.lastDailyReminderSentAt
      ? DateTime.fromJSDate(pref.lastDailyReminderSentAt).plus({ hours: MIN_HOURS_BETWEEN_REMINDERS })
      : null;
    if (throttleDeadline && nowUtc < throttleDeadline) {
      usersThrottled++;
      continue;
    }

    const actionable: ActionableChallenge[] = [];

    for (const m of user.memberships) {
      const ch = m.challenge;
      if (ch.locked) continue;

      const localNow = DateTime.now().setZone(ch.timezone);
      if (localNow.hour !== config.reminderNotificationHourLocal) continue;

      const challengeStart = DateTime.fromJSDate(ch.startDate, { zone: ch.timezone }).startOf("day");
      const challengeEnd = DateTime.fromJSDate(ch.endDate, { zone: ch.timezone }).endOf("day");
      const todayStart = localNow.startOf("day");
      if (todayStart < challengeStart || todayStart > challengeEnd) continue;

      const { start: todayRStart, end: todayREnd } = getTodayRange(ch.timezone);
      const submittedToday = await prisma.stepSubmission.findFirst({
        where: {
          userId: user.id,
          challengeId: ch.id,
          date: { gte: todayRStart.toJSDate(), lte: todayREnd.toJSDate() },
        },
        select: { id: true },
      });
      if (submittedToday) continue;

      const { start: yStart, end: yEnd } = getYesterdayRange(ch.timezone);
      const submittedYesterday = await prisma.stepSubmission.findFirst({
        where: {
          userId: user.id,
          challengeId: ch.id,
          date: { gte: yStart.toJSDate(), lte: yEnd.toJSDate() },
          steps: { gt: 0 },
        },
        select: { id: true },
      });

      actionable.push({ name: ch.name, streakRisk: Boolean(submittedYesterday) });
    }

    if (actionable.length === 0) continue;

    usersNotified++;
    const streakLine = actionable.some((a) => a.streakRisk)
      ? " Log today so you don't break your streak."
      : "";
    const names = actionable.map((a) => a.name).join(", ");
    const pushBody =
      actionable.length === 1
        ? `You have not logged steps today for "${actionable[0].name}".${streakLine}`
        : `${actionable.length} challenges need today's steps: ${names}.${streakLine}`;

    if (user.pushSubscriptions.length > 0 && isPushEnabled()) {
      const payload = {
        title: "StepSprint",
        body: pushBody,
        icon: "/icons/icon-192.png",
      };
      for (const sub of user.pushSubscriptions) {
        try {
          const result = await sendPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          if (result) pushAttempts++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            staleEndpoints.push(sub.endpoint);
          } else {
            pushFailures++;
            logger.warn({ err, endpoint: sub.endpoint }, "Push send failed");
          }
        }
      }
    }

    if (emailConfigured() && user.emailVerified) {
      const html = `
        <p>Hi,</p>
        <p>You have not logged today's steps yet for: <strong>${names}</strong>.</p>
        ${actionable.some((a) => a.streakRisk) ? "<p>Keep your streak alive by logging soon.</p>" : ""}
        <p>Open StepSprint to submit your totals.</p>
      `;
      try {
        await sendEmail({
          to: user.email,
          subject: "Reminder: log today's steps — StepSprint",
          text: `You have not logged today's steps yet for: ${names}.${streakLine} Open StepSprint to submit your totals.`,
          html,
        });
        emailsSent++;
      } catch (err) {
        logger.warn({ err, userId: user.id }, "Daily reminder email failed");
      }
    }

    await prisma.notificationPreference.update({
      where: { id: pref.id },
      data: { lastDailyReminderSentAt: new Date() },
    });
  }

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  logger.info(
    {
      usersNotified,
      usersThrottled,
      emailsSent,
      pushAttempts,
      pushFailures,
      staleRemoved: staleEndpoints.length,
    },
    "Hourly reminder sweep complete"
  );
}

let sweeping = false;

/**
 * Runs the reminder sweep hourly. Each user-local reminder fires when their
 * challenge timezone reaches `REMINDER_NOTIFICATION_HOUR_LOCAL` (default 17).
 *
 * Disabled automatically on serverless platforms (Vercel) where there is no
 * long-running process — Vercel Cron calls /api/cron/reminder-sweep directly.
 */
export function startDailyReminderScheduler(): void {
  // Vercel sets `VERCEL=1` in every function/build environment. Serverless
  // functions have no persistent process to host setInterval, and even if they
  // did each cold-started instance would queue duplicate sweeps.
  if (process.env.VERCEL === "1") {
    logger.info(
      "In-process reminder scheduler disabled (running on Vercel — use the Vercel Cron entry in vercel.json)."
    );
    return;
  }
  if (config.reminderUseExternalCron) {
    logger.info("In-process reminder scheduler disabled (REMINDER_USE_EXTERNAL_CRON=true)");
    return;
  }

  setTimeout(() => {
    void hourlyReminderSweep();
  }, 60_000);

  setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void hourlyReminderSweep()
      .catch((err: unknown) => logger.error({ err }, "Reminder sweep failed"))
      .finally(() => {
        sweeping = false;
      });
  }, HOURLY_MS);

  logger.info(
    {
      hourlyMs: HOURLY_MS,
      reminderHourLocalDefault: config.reminderNotificationHourLocal,
    },
    "Reminder scheduler started"
  );
}
