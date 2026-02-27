import { Router } from "express";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { getIsoWeekRange } from "../utils/dates";

const router = Router();

router.get("/weekly", async (req, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : "";
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

  const now = DateTime.now().setZone(challenge.timezone);
  const weekYear = req.query.weekYear ? Number(req.query.weekYear) : now.weekYear;
  const weekNumber = req.query.weekNumber ? Number(req.query.weekNumber) : now.weekNumber;

  const { start, end } = getIsoWeekRange(weekYear, weekNumber, challenge.timezone);
  const { start: prevStart, end: prevEnd } = getIsoWeekRange(
    weekYear,
    weekNumber - 1,
    challenge.timezone
  );

  const submissions = await prisma.stepSubmission.findMany({
    where: {
      challengeId,
      date: {
        gte: start.toJSDate(),
        lte: end.toJSDate(),
      },
    },
    include: { user: true },
  });

  const prevSubmissions = await prisma.stepSubmission.findMany({
    where: {
      challengeId,
      date: {
        gte: prevStart.toJSDate(),
        lte: prevEnd.toJSDate(),
      },
    },
    include: { user: true },
  });

  const totals = new Map<string, { userId: string; name: string; email: string; steps: number }>();
  submissions.forEach((submission) => {
    const existing = totals.get(submission.userId) ?? {
      userId: submission.userId,
      name: submission.user.name ?? "",
      email: submission.user.email,
      steps: 0,
    };
    existing.steps += submission.steps;
    totals.set(submission.userId, existing);
  });

  const prevTotals = new Map<string, number>();
  prevSubmissions.forEach((submission) => {
    const current = prevTotals.get(submission.userId) ?? 0;
    prevTotals.set(submission.userId, current + submission.steps);
  });

  const leaderboard = Array.from(totals.values())
    .map((entry) => {
      const prev = prevTotals.get(entry.userId) ?? 0;
      const delta = entry.steps - prev;
      const trend = delta > 0 ? "up" : delta < 0 ? "down" : "same";
      return { ...entry, trend, delta };
    })
    .sort((a, b) => b.steps - a.steps);

  res.json({ weekYear, weekNumber, leaderboard });
});

router.get("/teams", async (req, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : "";
  if (!challengeId) {
    res.status(400).json({ error: "challengeId required" });
    return;
  }
  const [teams, unassignedMembers, submissions] = await Promise.all([
    prisma.team.findMany({
      where: { challengeId },
      include: { members: { include: { user: true } }, challenge: true },
    }),
    prisma.teamMember.findMany({
      where: { challengeId, teamId: null },
      include: { user: true },
    }),
    prisma.stepSubmission.findMany({ where: { challengeId } }),
  ]);

  const stepsByUser = new Map<string, number>();
  submissions.forEach((submission) => {
    stepsByUser.set(
      submission.userId,
      (stepsByUser.get(submission.userId) ?? 0) + submission.steps
    );
  });

  const leaderboard = teams
    .map((team) => {
      const memberSteps = team.members.map((member) => ({
        member,
        steps: stepsByUser.get(member.userId) ?? 0,
      }));
      const totalSteps = memberSteps.reduce((sum, entry) => sum + entry.steps, 0);
      const leader = memberSteps.sort((a, b) => b.steps - a.steps)[0];
      const avgSteps = memberSteps.length ? Math.round(totalSteps / memberSteps.length) : 0;
      return {
        teamId: team.id,
        teamName: team.name,
        totalSteps,
        avgSteps,
        leaderName: leader?.member.user.name ?? leader?.member.user.email ?? "",
        leaderSteps: leader?.steps ?? 0,
      };
    })
    .sort((a, b) => b.totalSteps - a.totalSteps);

  if (unassignedMembers.length > 0) {
    const memberSteps = unassignedMembers.map((member) => ({
      member,
      steps: stepsByUser.get(member.userId) ?? 0,
    }));
    const totalSteps = memberSteps.reduce((sum, entry) => sum + entry.steps, 0);
    const leader = memberSteps.sort((a, b) => b.steps - a.steps)[0];
    const avgSteps = memberSteps.length ? Math.round(totalSteps / memberSteps.length) : 0;
    leaderboard.push({
      teamId: "unassigned",
      teamName: "Unassigned",
      totalSteps,
      avgSteps,
      leaderName: leader?.member.user.name ?? leader?.member.user.email ?? "",
      leaderSteps: leader?.steps ?? 0,
    });
    leaderboard.sort((a, b) => b.totalSteps - a.totalSteps);
  }

  const topTotal = leaderboard[0]?.totalSteps ?? 0;
  const withGap = leaderboard.map((entry) => ({
    ...entry,
    stepsBehind: topTotal - entry.totalSteps,
  }));

  res.json({ leaderboard: withGap });
});

export default router;
