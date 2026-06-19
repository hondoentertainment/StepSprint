import { Router } from "express";
import { prisma } from "../prisma";
import { DateTime } from "luxon";
import { authRequired, roleRequired, AuthenticatedRequest } from "../middleware/auth";
import { Role, type Challenge } from "@prisma/client";

const router = Router();

router.use(authRequired, roleRequired(Role.ADMIN));

/** A participant counts as dormant once they have not logged for this many days. */
const DORMANT_AFTER_DAYS = 2;
/** Dormant participants past this threshold are flagged for active re-engagement. */
const RE_ENGAGEMENT_AFTER_DAYS = 5;

type ChallengeMetrics = {
  challengeId: string;
  challengeName: string;
  lifecycle: "upcoming" | "active" | "completed";
  elapsedDays: number;
  participantCount: number;
  participationRate: number;
  neverLoggedCount: number;
  dormantParticipantCount: number;
  reEngagementNeededCount: number;
  dropoutCount: number;
  avgActiveDays: number;
  totalSubmissions: number;
  totalSteps: number;
  submissionTrend: { weekYear: number; weekNumber: number; label: string; submissionCount: number }[];
  inactiveParticipants: { email: string; name: string }[];
};

async function computeChallengeMetrics(challenge: Challenge): Promise<ChallengeMetrics> {
  const tz = challenge.timezone;
  const now = DateTime.now().setZone(tz);
  const start = DateTime.fromJSDate(challenge.startDate, { zone: tz });
  const end = DateTime.fromJSDate(challenge.endDate, { zone: tz });
  const elapsedDays = Math.max(1, end.diff(start, "days").days + 1);

  const lifecycle: ChallengeMetrics["lifecycle"] =
    now < start ? "upcoming" : now > end.endOf("day") ? "completed" : "active";

  const members = await prisma.teamMember.findMany({
    where: { challengeId: challenge.id },
    include: { user: true },
  });

  const submissions = await prisma.stepSubmission.findMany({
    where: { challengeId: challenge.id },
  });

  const activeByUser = new Map<string, number>();
  const lastSubmissionByUser = new Map<string, DateTime>();
  submissions.forEach((s) => {
    activeByUser.set(s.userId, (activeByUser.get(s.userId) ?? 0) + 1);
    const d = DateTime.fromJSDate(s.date, { zone: tz });
    const prev = lastSubmissionByUser.get(s.userId);
    if (!prev || d > prev) lastSubmissionByUser.set(s.userId, d);
  });

  let neverLoggedCount = 0;
  let dormantParticipantCount = 0;
  let reEngagementNeededCount = 0;
  members.forEach((m) => {
    const last = lastSubmissionByUser.get(m.userId);
    if (!last) {
      neverLoggedCount += 1;
      return;
    }
    const daysSinceLast = now.startOf("day").diff(last.startOf("day"), "days").days;
    if (daysSinceLast >= DORMANT_AFTER_DAYS) {
      dormantParticipantCount += 1;
      if (daysSinceLast >= RE_ENGAGEMENT_AFTER_DAYS) reEngagementNeededCount += 1;
    }
  });

  const participationRate =
    members.length > 0
      ? members.filter((m) => (activeByUser.get(m.userId) ?? 0) > 0).length / members.length
      : 0;
  const dropoutCount = members.filter((m) => (activeByUser.get(m.userId) ?? 0) === 0).length;
  const avgActiveDays =
    members.length > 0
      ? members.reduce((sum, m) => sum + (activeByUser.get(m.userId) ?? 0), 0) / members.length
      : 0;
  const totalSubmissions = submissions.length;
  const totalSteps = submissions.reduce((sum, s) => sum + s.steps, 0);

  const submissionTrend: ChallengeMetrics["submissionTrend"] = [];
  for (let back = 3; back >= 0; back--) {
    const anchor = now.minus({ weeks: back }).startOf("week");
    const wStart = anchor.startOf("day");
    const wEnd = anchor.endOf("week").endOf("day");
    const submissionCount = submissions.filter((s) => {
      const d = DateTime.fromJSDate(s.date, { zone: tz });
      return d >= wStart && d <= wEnd;
    }).length;
    submissionTrend.push({
      weekYear: anchor.weekYear,
      weekNumber: anchor.weekNumber,
      label: anchor.toFormat("LLL d") + " week",
      submissionCount,
    });
  }

  const inactiveParticipants = members
    .filter((m) => (activeByUser.get(m.userId) ?? 0) === 0)
    .map((m) => ({ email: m.user.email, name: m.user.name ?? "" }))
    .slice(0, 100);

  return {
    challengeId: challenge.id,
    challengeName: challenge.name,
    lifecycle,
    elapsedDays,
    participantCount: members.length,
    participationRate: Math.round(participationRate * 100),
    neverLoggedCount,
    dormantParticipantCount,
    reEngagementNeededCount,
    dropoutCount,
    avgActiveDays: Math.round(avgActiveDays * 10) / 10,
    totalSubmissions,
    totalSteps,
    submissionTrend,
    inactiveParticipants,
  };
}

/** Admin: challenge analytics */
router.get("/", async (req: AuthenticatedRequest, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : undefined;
  if (!challengeId) {
    res.status(400).json({ error: "challengeId required" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const metrics = await computeChallengeMetrics(challenge);
  res.json(metrics);
});

/** Admin: cohort summary across all challenges (lighter than the per-challenge view). */
router.get("/cohort", async (_req: AuthenticatedRequest, res) => {
  const challenges = await prisma.challenge.findMany({ orderBy: { createdAt: "desc" } });
  const summaries = await Promise.all(
    challenges.map(async (challenge) => {
      const m = await computeChallengeMetrics(challenge);
      return {
        challengeId: m.challengeId,
        challengeName: m.challengeName,
        lifecycle: m.lifecycle,
        participantCount: m.participantCount,
        participationRate: m.participationRate,
        neverLoggedCount: m.neverLoggedCount,
        dormantParticipantCount: m.dormantParticipantCount,
        reEngagementNeededCount: m.reEngagementNeededCount,
      };
    })
  );
  res.json({ challenges: summaries });
});

export default router;
