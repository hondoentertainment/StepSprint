import cron from "node-cron";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { config } from "../config";
import { sendEmail } from "../services/email";
import { getTodayRange } from "../utils/dates";

async function hasSubmissionForDay(
  userId: string,
  challengeId: string,
  dayStart: DateTime,
  dayEnd: DateTime
): Promise<boolean> {
  const row = await prisma.stepSubmission.findFirst({
    where: {
      userId,
      challengeId,
      date: { gte: dayStart.toJSDate(), lte: dayEnd.toJSDate() },
      steps: { gt: 0 },
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function runReminderRound(): Promise<void> {
  const prefs = await prisma.notificationPreference.findMany({
    where: {
      OR: [{ dailyReminder: true }, { streakAtRiskReminder: true }],
    },
    include: {
      user: {
        include: {
          memberships: { include: { challenge: true } },
        },
      },
    },
  });

  for (const pref of prefs) {
    const user = pref.user;
    const dailyLines: string[] = [];
    const streakLines: string[] = [];

    for (const m of user.memberships) {
      const ch = m.challenge;
      const tz = ch.timezone;
      const today = DateTime.now().setZone(tz).startOf("day");
      const cStart = DateTime.fromJSDate(ch.startDate, { zone: tz }).startOf("day");
      const cEnd = DateTime.fromJSDate(ch.endDate, { zone: tz }).endOf("day");
      if (today < cStart || today > cEnd) continue;

      const { start: todayStart, end: todayEnd } = getTodayRange(tz);
      const y = DateTime.now().setZone(tz).minus({ days: 1 }).startOf("day");
      const yesterdayStart = y;
      const yesterdayEnd = y.endOf("day");

      const loggedToday = await hasSubmissionForDay(user.id, ch.id, todayStart, todayEnd);
      const loggedYesterday = await hasSubmissionForDay(user.id, ch.id, yesterdayStart, yesterdayEnd);

      if (pref.dailyReminder && !loggedToday) {
        dailyLines.push(`• ${ch.name} — you have not logged steps yet today.`);
      }

      if (pref.streakAtRiskReminder && !loggedToday && loggedYesterday) {
        streakLines.push(
          `• ${ch.name} — log today to keep your streak going (you logged yesterday).`
        );
      }
    }

    if (dailyLines.length === 0 && streakLines.length === 0) continue;

    const parts: string[] = [];
    if (dailyLines.length) {
      parts.push("Daily step reminder:\n" + dailyLines.join("\n"));
    }
    if (streakLines.length) {
      parts.push("Streak reminder:\n" + streakLines.join("\n"));
    }
    const text = `Hi${user.name ? ` ${user.name}` : ""},\n\n${parts.join("\n\n")}\n\n— StepSprint`;

    await sendEmail({
      to: user.email,
      subject: "StepSprint reminders",
      text,
    });
  }
}

export function scheduleReminderJobs(): void {
  const ok = cron.validate(config.reminderCron);
  if (!ok) {
    console.warn(`Invalid REMINDER_CRON "${config.reminderCron}" — reminders disabled`);
    return;
  }
  cron.schedule(
    config.reminderCron,
    () => {
      runReminderRound().catch((err) => console.error("Reminder job failed:", err));
    },
    { timezone: config.reminderTz }
  );
  console.log(`Reminder cron: ${config.reminderCron} (${config.reminderTz})`);
}
