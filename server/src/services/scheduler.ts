import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { isPushEnabled, sendPush } from "./push";
import { logger } from "../logger";

const DAILY_REMINDER_HOUR_UTC = 8;

async function sendDailyReminders(): Promise<void> {
  if (!isPushEnabled()) return;

  const preferences = await prisma.notificationPreference.findMany({
    where: { dailyReminder: true },
    include: {
      user: { include: { pushSubscriptions: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  const staleEndpoints: string[] = [];

  const payload = {
    title: "StepSprint",
    body: "Don't forget to log your steps today!",
    icon: "/icons/icon-192.png",
  };

  for (const pref of preferences) {
    for (const sub of pref.user.pushSubscriptions) {
      try {
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        if (result) sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          failed++;
          logger.warn({ err, endpoint: sub.endpoint }, "Push send failed");
        }
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  logger.info(
    { sent, failed, staleRemoved: staleEndpoints.length },
    "Daily push reminders sent"
  );
}

function msUntilNextUtcHour(hour: number): number {
  const now = DateTime.utc();
  let next = now.set({ hour, minute: 0, second: 0, millisecond: 0 });
  if (next <= now) next = next.plus({ days: 1 });
  return next.diff(now).as("milliseconds");
}

/**
 * Schedules a daily push reminder at DAILY_REMINDER_HOUR_UTC (UTC). Each
 * time the job fires it re-schedules itself for the next day, so the timeout
 * stays accurate even across DST boundaries.
 */
export function startDailyReminderScheduler(): void {
  function schedule(): void {
    const delay = msUntilNextUtcHour(DAILY_REMINDER_HOUR_UTC);
    setTimeout(() => {
      void sendDailyReminders();
      schedule();
    }, delay);
  }
  schedule();
  logger.info(
    { hourUtc: DAILY_REMINDER_HOUR_UTC },
    "Daily push reminder scheduler started"
  );
}
