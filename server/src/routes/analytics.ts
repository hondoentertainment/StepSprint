import { Router } from "express";
import { prisma } from "../prisma";
import { DateTime } from "luxon";
import { authRequired, roleRequired, AuthenticatedRequest } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

router.use(authRequired, roleRequired(Role.ADMIN));

/** Admin: challenge analytics */
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

  const tz = challenge.timezone;
  const start = DateTime.fromJSDate(challenge.startDate, { zone: tz });
  const end = DateTime.fromJSDate(challenge.endDate, { zone: tz });
  const elapsedDays = Math.max(1, end.diff(start, "days").days + 1);

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

  const participationRate =
    members.length > 0
      ? members.filter((m) => (activeByUser.get(m.userId) ?? 0) > 0).length / members.length
      : 0;
  const avgActiveDays =
    members.length > 0
      ? members.reduce((sum, m) => sum + (activeByUser.get(m.userId) ?? 0), 0) / members.length
      : 0;
  const totalSubmissions = submissions.length;
  const totalSteps = submissions.reduce((sum, s) => sum + s.steps, 0);

  res.json({
    challengeId,
    challengeName: challenge.name,
    elapsedDays,
    participantCount: members.length,
    participationRate: Math.round(participationRate * 100),
    avgActiveDays: Math.round(avgActiveDays * 10) / 10,
    totalSubmissions,
    totalSteps,
  });
});

export default router;
