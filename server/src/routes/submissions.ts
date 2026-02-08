import { Router } from "express";
import { z } from "zod";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { toDateOnly, toJsDate } from "../utils/dates";

const router = Router();

const submissionSchema = z.object({
  challengeId: z.string().min(1),
  date: z.string().min(1),
  steps: z.number().int().min(0),
});

router.post("/", authRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid submission payload" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: parsed.data.challengeId },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  if (challenge.locked) {
    res.status(403).json({ error: "Submissions are locked for this challenge" });
    return;
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      userId_challengeId: {
        userId: req.user.id,
        challengeId: challenge.id,
      },
    },
  });
  if (!membership) {
    res.status(403).json({ error: "Not enrolled in this challenge" });
    return;
  }

  const date = toDateOnly(parsed.data.date, challenge.timezone);
  const start = toDateOnly(
    DateTime.fromJSDate(challenge.startDate, { zone: challenge.timezone }).toISODate() ?? "",
    challenge.timezone
  );
  const end = toDateOnly(
    DateTime.fromJSDate(challenge.endDate, { zone: challenge.timezone }).toISODate() ?? "",
    challenge.timezone
  );

  if (date < start || date > end) {
    res.status(400).json({ error: "Date is outside challenge range" });
    return;
  }

  const submission = await prisma.stepSubmission.upsert({
    where: {
      userId_challengeId_date: {
        userId: req.user.id,
        challengeId: challenge.id,
        date: toJsDate(date),
      },
    },
    update: {
      steps: parsed.data.steps,
      isFlagged: parsed.data.steps > 100000,
    },
    create: {
      userId: req.user.id,
      challengeId: challenge.id,
      date: toJsDate(date),
      steps: parsed.data.steps,
      isFlagged: parsed.data.steps > 100000,
    },
  });

  res.json({ submission });
});

export default router;
