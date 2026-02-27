import { Router } from "express";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { getTodayRange, getWeekRange, getMonthRange } from "../utils/dates";

const router = Router();

router.get("/", authRequired, async (req: AuthenticatedRequest, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : "";
  if (!challengeId) {
    res.status(400).json({ error: "challengeId required" });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      userId_challengeId: { userId: req.user.id, challengeId },
    },
    include: { team: true },
  });
  if (!membership) {
    res.status(403).json({ error: "Not enrolled in this challenge" });
    return;
  }

  const todayRange = getTodayRange(challenge.timezone);
  const weekRange = getWeekRange(challenge.timezone);
  const monthRange = getMonthRange(challenge.timezone);

  const [todayTotal, weekTotal, monthTotal] = await Promise.all([
    prisma.stepSubmission.aggregate({
      where: {
        challengeId,
        userId: req.user.id,
        date: {
          gte: todayRange.start.toJSDate(),
          lte: todayRange.end.toJSDate(),
        },
      },
      _sum: { steps: true },
    }),
    prisma.stepSubmission.aggregate({
      where: {
        challengeId,
        userId: req.user.id,
        date: {
          gte: weekRange.start.toJSDate(),
          lte: weekRange.end.toJSDate(),
        },
      },
      _sum: { steps: true },
    }),
    prisma.stepSubmission.aggregate({
      where: {
        challengeId,
        userId: req.user.id,
        date: {
          gte: monthRange.start.toJSDate(),
          lte: monthRange.end.toJSDate(),
        },
      },
      _sum: { steps: true },
    }),
  ]);

  const teamMembers = membership.teamId
    ? await prisma.teamMember.findMany({
        where: { teamId: membership.teamId },
      })
    : [];

  const teamUserIds = teamMembers.map((member) => member.userId);
  const teamTotal = teamUserIds.length
    ? await prisma.stepSubmission.aggregate({
        where: { challengeId, userId: { in: teamUserIds } },
        _sum: { steps: true },
      })
    : { _sum: { steps: 0 } };

  const totals = await prisma.stepSubmission.groupBy({
    by: ["userId"],
    where: { challengeId },
    _sum: { steps: true },
  });
  const sortedTotals = totals
    .map((entry) => ({ userId: entry.userId, steps: entry._sum.steps ?? 0 }))
    .sort((a, b) => b.steps - a.steps);
  const userTotal = sortedTotals.find((entry) => entry.userId === req.user?.id)?.steps ?? 0;
  const topTotal = sortedTotals[0]?.steps ?? 0;
  const rank = sortedTotals.findIndex((entry) => entry.userId === req.user?.id) + 1;

  const challengeStart = DateTime.fromJSDate(challenge.startDate, { zone: challenge.timezone }).startOf(
    "day"
  );
  const challengeEnd = DateTime.fromJSDate(challenge.endDate, { zone: challenge.timezone }).startOf("day");
  const today = DateTime.now().setZone(challenge.timezone).startOf("day");
  const scoringEnd = today < challengeEnd ? today : challengeEnd;
  const hasScoringWindow = scoringEnd >= challengeStart;

  const activitySubmissions = hasScoringWindow
    ? await prisma.stepSubmission.findMany({
        where: {
          challengeId,
          userId: req.user.id,
          steps: { gt: 0 },
          date: {
            gte: challengeStart.toJSDate(),
            lte: scoringEnd.endOf("day").toJSDate(),
          },
        },
        select: { date: true },
      })
    : [];

  const activeDays: Set<string> = new Set(
    activitySubmissions
      .map((submission) => DateTime.fromJSDate(submission.date, { zone: challenge.timezone }).toISODate())
      .filter((isoDate): isoDate is string => Boolean(isoDate))
  );

  const elapsedDays = hasScoringWindow
    ? Math.max(0, Math.floor(scoringEnd.diff(challengeStart, "days").days) + 1)
    : 0;
  const consistencyScore =
    elapsedDays > 0 ? Math.round((activeDays.size / elapsedDays) * 100) : 0;

  let currentStreakDays = 0;
  if (hasScoringWindow) {
    let cursor = scoringEnd;
    let cursorIso = cursor.toISODate();
    while (cursorIso && activeDays.has(cursorIso)) {
      currentStreakDays += 1;
      cursor = cursor.minus({ days: 1 });
      cursorIso = cursor.toISODate();
    }
  }

  let longestStreakDays = 0;
  const orderedActiveDays = Array.from(activeDays).sort();
  let streakRun = 0;
  let previousDay: DateTime | null = null;
  for (const isoDate of orderedActiveDays) {
    const day = DateTime.fromISO(isoDate, { zone: challenge.timezone }).startOf("day");
    if (previousDay && Math.round(day.diff(previousDay, "days").days) === 1) {
      streakRun += 1;
    } else {
      streakRun = 1;
    }
    if (streakRun > longestStreakDays) {
      longestStreakDays = streakRun;
    }
    previousDay = day;
  }

  res.json({
    personalTotals: {
      today: todayTotal._sum.steps ?? 0,
      week: weekTotal._sum.steps ?? 0,
      month: monthTotal._sum.steps ?? 0,
    },
    teamTotals: {
      teamName: membership.team?.name ?? "",
      total: teamTotal._sum.steps ?? 0,
    },
    rank: rank || null,
    gapToFirst: Math.max(0, topTotal - userTotal),
    streak: {
      currentDays: currentStreakDays,
      longestDays: longestStreakDays,
    },
    consistency: {
      activeDays: activeDays.size,
      elapsedDays,
      score: consistencyScore,
    },
  });
});

export default router;
