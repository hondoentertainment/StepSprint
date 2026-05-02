import { Router } from "express";
import { prisma } from "../prisma";
import { DateTime } from "luxon";
import { authRequired, roleRequired, AuthenticatedRequest } from "../middleware/auth";
import { Role } from "@prisma/client";
import type { Challenge } from "@prisma/client";

const router = Router();

const DORMANT_LOOKBACK_DAYS = 7;

export type ChallengeAnalyticsPayload = {
  challengeId: string;
  challengeName: string;
  elapsedDays: number;
  participantCount: number;
  participantsWithSubmission: number;
  participationRate: number;
  neverLoggedCount: number;
  dormantParticipantCount: number;
  dormantLookbackDays: number;
  avgActiveDays: number;
  totalSubmissions: number;
  totalSteps: number;
  submissionTrend: Array<{ date: string; submissionsCount: number }>;
};

type BuildOpts = {
  includeSubmissionTrend?: boolean;
};

async function buildChallengeAnalytics(
  challenge: Challenge,
  opts: BuildOpts = {}
): Promise<ChallengeAnalyticsPayload> {
  const { includeSubmissionTrend = true } = opts;
  const challengeId = challenge.id;
  const tz = challenge.timezone;
  const start = DateTime.fromJSDate(challenge.startDate, { zone: tz });
  const end = DateTime.fromJSDate(challenge.endDate, { zone: tz });
  const elapsedDays = Math.max(1, Math.floor(end.diff(start, "days").days) + 1);

  const members = await prisma.teamMember.findMany({
    where: { challengeId },
    include: { user: true },
  });

  const submissions = await prisma.stepSubmission.findMany({
    where: { challengeId },
  });

  const activeByUser = new Map<string, number>();
  submissions.forEach((s) => {
    activeByUser.set(s.userId, (activeByUser.get(s.userId) ?? 0) + 1);
  });

  const lastSubmissionByUser = new Map<string, DateTime>();
  submissions.forEach((s) => {
    const iso = DateTime.fromJSDate(s.date, { zone: tz }).toISODate();
    const day = iso ? DateTime.fromISO(iso, { zone: tz }).startOf("day") : null;
    const prev = lastSubmissionByUser.get(s.userId);
    if (day && (!prev || day > prev)) {
      lastSubmissionByUser.set(s.userId, day);
    }
  });

  const cutoffDormant = DateTime.now().setZone(tz).minus({ days: DORMANT_LOOKBACK_DAYS }).startOf("day");

  const participantsWithSubmission = members.filter((m) => (activeByUser.get(m.userId) ?? 0) > 0).length;
  const neverLoggedCount = members.length - participantsWithSubmission;

  const dormantParticipantCount = members.filter((m) => {
    const last = lastSubmissionByUser.get(m.userId);
    if (!last) return true;
    return last < cutoffDormant;
  }).length;

  const participationRate = members.length > 0 ? participantsWithSubmission / members.length : 0;
  const avgActiveDays =
    members.length > 0
      ? members.reduce((sum, m) => sum + (activeByUser.get(m.userId) ?? 0), 0) / members.length
      : 0;
  const totalSubmissions = submissions.length;
  const totalSteps = submissions.reduce((sum, s) => sum + s.steps, 0);

  let submissionTrend: Array<{ date: string; submissionsCount: number }> = [];
  if (includeSubmissionTrend) {
    const trendMap = new Map<string, number>();
    for (const s of submissions) {
      const k = DateTime.fromJSDate(s.date, { zone: tz }).toISODate() ?? "";
      if (!k) continue;
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    }
    submissionTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, submissionsCount]) => ({ date, submissionsCount }));
  }

  return {
    challengeId,
    challengeName: challenge.name,
    elapsedDays,
    participantCount: members.length,
    participantsWithSubmission,
    participationRate: Math.round(participationRate * 100),
    neverLoggedCount,
    dormantParticipantCount,
    dormantLookbackDays: DORMANT_LOOKBACK_DAYS,
    avgActiveDays: Math.round(avgActiveDays * 10) / 10,
    totalSubmissions,
    totalSteps,
    submissionTrend,
  };
}

router.use(authRequired, roleRequired(Role.ADMIN));

/** Admin: compare engagement across all challenges */
router.get("/cohort", async (_req: AuthenticatedRequest, res) => {
  const challenges = await prisma.challenge.findMany({
    orderBy: { startDate: "desc" },
  });

  const rows = await Promise.all(
    challenges.map(async (ch) => {
      const full = await buildChallengeAnalytics(ch, { includeSubmissionTrend: false });
      const tz = ch.timezone;
      const start = DateTime.fromJSDate(ch.startDate, { zone: tz }).startOf("day");
      const end = DateTime.fromJSDate(ch.endDate, { zone: tz }).endOf("day");
      const today = DateTime.now().setZone(tz).startOf("day");
      let lifecycle: "upcoming" | "active" | "ended";
      if (today < start) lifecycle = "upcoming";
      else if (today > end) lifecycle = "ended";
      else lifecycle = "active";

      return {
        challengeId: full.challengeId,
        challengeName: full.challengeName,
        startDate: ch.startDate.toISOString(),
        endDate: ch.endDate.toISOString(),
        timezone: tz,
        lifecycle,
        participantCount: full.participantCount,
        participationRate: full.participationRate,
        neverLoggedCount: full.neverLoggedCount,
        dormantParticipantCount: full.dormantParticipantCount,
        avgActiveDays: full.avgActiveDays,
        totalSubmissions: full.totalSubmissions,
        totalSteps: full.totalSteps,
      };
    })
  );

  res.json({ challenges: rows });
});

/** Admin: challenge analytics — participation, activity trend, dormant members */
router.get("/", async (req: AuthenticatedRequest, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : undefined;
  if (!challengeId) {
    res.status(400).json({ error: "challengeId required" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const payload = await buildChallengeAnalytics(challenge);
  res.json(payload);
});

export default router;
