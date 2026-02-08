import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { sameMonthRange, toDateOnly, toJsDate, getIsoWeekRange } from "../utils/dates";
import { AuthenticatedRequest, authRequired, roleRequired } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

router.use(authRequired, roleRequired(Role.ADMIN));

const challengeSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  timezone: z.string().optional(),
  teamSize: z.number().int().min(2),
});

router.get("/challenges", async (_req, res) => {
  const challenges = await prisma.challenge.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json({ challenges });
});

router.post("/challenges", async (req, res) => {
  const parsed = challengeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid challenge payload" });
    return;
  }

  const tz = parsed.data.timezone ?? config.defaultChallengeTz;
  if (!sameMonthRange(parsed.data.startDate, parsed.data.endDate, tz)) {
    res.status(400).json({ error: "Challenge dates must be within the same month" });
    return;
  }

  const challenge = await prisma.challenge.create({
    data: {
      name: parsed.data.name,
      startDate: toJsDate(toDateOnly(parsed.data.startDate, tz)),
      endDate: toJsDate(toDateOnly(parsed.data.endDate, tz)),
      timezone: tz,
      teamSize: parsed.data.teamSize,
    },
  });

  res.json({ challenge });
});

router.patch("/challenges/:id/lock", async (req, res) => {
  const body = z.object({ locked: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid lock payload" });
    return;
  }

  const challenge = await prisma.challenge.update({
    where: { id: req.params.id },
    data: { locked: body.data.locked },
  });

  await prisma.auditLog.create({
    data: {
      action: body.data.locked ? "challenge.lock" : "challenge.unlock",
      actorId: (req as AuthenticatedRequest).user?.id,
      challengeId: challenge.id,
    },
  });

  res.json({ challenge });
});

const participantsSchema = z
  .object({
    emails: z.array(z.string().email()).optional(),
    userIds: z.array(z.string()).optional(),
  })
  .refine((data) => (data.emails?.length ?? 0) + (data.userIds?.length ?? 0) > 0, {
    message: "Provide emails or userIds",
  });

router.post("/challenges/:id/participants", async (req, res) => {
  const parsed = participantsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid participants payload" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: req.params.id },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const usersFromEmails = parsed.data.emails
    ? await Promise.all(
        parsed.data.emails.map((email) =>
          prisma.user.upsert({
            where: { email },
            update: {},
            create: { email },
          })
        )
      )
    : [];

  const usersFromIds = parsed.data.userIds?.length
    ? await prisma.user.findMany({ where: { id: { in: parsed.data.userIds } } })
    : [];

  const userIds = [...usersFromEmails, ...usersFromIds].map((user) => user.id);

  await prisma.teamMember.createMany({
    data: userIds.map((userId) => ({
      userId,
      challengeId: challenge.id,
      teamId: null,
      isLeader: false,
    })),
    skipDuplicates: true,
  });

  await prisma.auditLog.create({
    data: {
      action: "participants.add",
      actorId: (req as AuthenticatedRequest).user?.id,
      challengeId: challenge.id,
      metadata: { count: userIds.length },
    },
  });

  res.json({ added: userIds.length });
});

const assignSchema = z.object({
  strategy: z.enum(["random", "snake"]).optional(),
});

router.post("/challenges/:id/assign-teams", async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid assignment payload" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: req.params.id },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const members = await prisma.teamMember.findMany({
    where: { challengeId: challenge.id },
    include: { user: true },
  });

  if (members.length === 0) {
    res.status(400).json({ error: "No participants to assign" });
    return;
  }

  if (members.length % challenge.teamSize !== 0) {
    res.status(400).json({ error: "Participants must divide evenly by team size" });
    return;
  }

  let orderedMembers = [...members];
  if (parsed.data.strategy === "snake") {
    const totals = await prisma.stepSubmission.groupBy({
      by: ["userId"],
      _sum: { steps: true },
    });
    const totalMap = new Map(totals.map((row) => [row.userId, row._sum.steps ?? 0]));
    orderedMembers.sort((a, b) => (totalMap.get(b.userId) ?? 0) - (totalMap.get(a.userId) ?? 0));
  } else {
    orderedMembers.sort(() => Math.random() - 0.5);
  }

  const teamCount = members.length / challenge.teamSize;
  const teamNames = Array.from({ length: teamCount }).map((_, idx) => {
    const letter = String.fromCharCode(65 + (idx % 26));
    return `Team ${letter}`;
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.teamMember.updateMany({
      where: { challengeId: challenge.id },
      data: { teamId: null, isLeader: false },
    });
    await tx.team.deleteMany({ where: { challengeId: challenge.id } });

    const teams = await Promise.all(
      teamNames.map((name) =>
        tx.team.create({ data: { name, challengeId: challenge.id } })
      )
    );

    const assignments: Array<{ memberId: string; teamId: string; isLeader: boolean }> = [];
    let direction = 1;
    let teamIndex = 0;
    orderedMembers.forEach((member) => {
      const team = teams[teamIndex];
      if (!team) return;
      assignments.push({
        memberId: member.id,
        teamId: team.id,
        isLeader: false,
      });
      teamIndex += direction;
      if (teamIndex === teamCount) {
        direction = -1;
        teamIndex = teamCount - 1;
      } else if (teamIndex < 0) {
        direction = 1;
        teamIndex = 0;
      }
    });

    await Promise.all(
      assignments.map((assignment) =>
        tx.teamMember.update({
          where: { id: assignment.memberId },
          data: { teamId: assignment.teamId, isLeader: assignment.isLeader },
        })
      )
    );

    for (const team of teams) {
      const leader = assignments.find((assignment) => assignment.teamId === team.id);
      if (leader) {
        await tx.teamMember.update({
          where: { id: leader.memberId },
          data: { isLeader: true },
        });
      }
    }

    return teams;
  });

  await prisma.auditLog.create({
    data: {
      action: "teams.assign",
      actorId: (req as AuthenticatedRequest).user?.id,
      challengeId: challenge.id,
      metadata: { strategy: parsed.data.strategy ?? "random" },
    },
  });

  res.json({ teams: result });
});

router.get("/submissions", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : "";
  const submissions = await prisma.stepSubmission.findMany({
    where: {
      OR: [
        { user: { email: { contains: query, mode: "insensitive" } } },
        { user: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    include: { user: true, challenge: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  res.json({ submissions });
});

const editSchema = z.object({
  steps: z.number().int().min(0).optional(),
  date: z.string().optional(),
  reason: z.string().min(3),
});

router.patch("/submissions/:id", async (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid edit payload" });
    return;
  }

  const submission = await prisma.stepSubmission.findUnique({
    where: { id: req.params.id },
    include: { challenge: true },
  });
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const tz = submission.challenge.timezone;
  const updated = await prisma.stepSubmission.update({
    where: { id: submission.id },
    data: {
      steps: parsed.data.steps ?? submission.steps,
      date: parsed.data.date
        ? toJsDate(toDateOnly(parsed.data.date, tz))
        : submission.date,
      isFlagged: (parsed.data.steps ?? submission.steps) > 100000,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "submission.edit",
      reason: parsed.data.reason,
      actorId: (req as AuthenticatedRequest).user?.id,
      challengeId: submission.challengeId,
      metadata: { submissionId: submission.id },
    },
  });

  res.json({ submission: updated });
});

const deleteSchema = z.object({ reason: z.string().min(3) });

router.delete("/submissions/:id", async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Reason required" });
    return;
  }

  const submission = await prisma.stepSubmission.findUnique({
    where: { id: req.params.id },
  });
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  await prisma.stepSubmission.delete({ where: { id: submission.id } });
  await prisma.auditLog.create({
    data: {
      action: "submission.delete",
      reason: parsed.data.reason,
      actorId: (req as AuthenticatedRequest).user?.id,
      challengeId: submission.challengeId,
      metadata: { submissionId: submission.id },
    },
  });

  res.json({ ok: true });
});

router.get("/export/submissions", async (req, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : undefined;
  const submissions = await prisma.stepSubmission.findMany({
    where: challengeId ? { challengeId } : undefined,
    include: { user: true, challenge: true },
    orderBy: { date: "desc" },
  });
  const rows = [
    ["challenge", "email", "name", "date", "steps", "flagged"].join(","),
    ...submissions.map((submission) =>
      [
        submission.challenge.name,
        submission.user.email,
        submission.user.name ?? "",
        submission.date.toISOString().slice(0, 10),
        submission.steps.toString(),
        submission.isFlagged ? "yes" : "no",
      ].join(",")
    ),
  ];
  res.header("Content-Type", "text/csv");
  res.send(rows.join("\n"));
});

router.get("/export/teams", async (req, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : undefined;
  if (!challengeId) {
    res.status(400).json({ error: "challengeId required" });
    return;
  }
  const teams = await prisma.team.findMany({
    where: { challengeId },
    include: { members: { include: { user: true } }, challenge: true },
  });
  const rows = [
    ["challenge", "team", "leader", "memberEmail", "memberName"].join(","),
    ...teams.flatMap((team) =>
      team.members.map((member) => [
        team.challenge.name,
        team.name,
        team.members.find((m) => m.isLeader)?.user.email ?? "",
        member.user.email,
        member.user.name ?? "",
      ])
    ),
  ];
  res.header("Content-Type", "text/csv");
  res.send(rows.map((row) => row.join(",")).join("\n"));
});

router.get("/export/weekly", async (req, res) => {
  const challengeId = typeof req.query.challengeId === "string" ? req.query.challengeId : undefined;
  const weekYear = Number(req.query.weekYear);
  const weekNumber = Number(req.query.weekNumber);
  if (!challengeId || !weekYear || !weekNumber) {
    res.status(400).json({ error: "challengeId, weekYear, weekNumber required" });
    return;
  }
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  const { start, end } = getIsoWeekRange(weekYear, weekNumber, challenge.timezone);
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
  const totals = new Map<string, { email: string; name: string; steps: number }>();
  submissions.forEach((submission) => {
    const key = submission.userId;
    const current = totals.get(key) ?? {
      email: submission.user.email,
      name: submission.user.name ?? "",
      steps: 0,
    };
    current.steps += submission.steps;
    totals.set(key, current);
  });
  const rows = [
    ["email", "name", "steps"].join(","),
    ...Array.from(totals.values())
      .sort((a, b) => b.steps - a.steps)
      .map((row) => [row.email, row.name, row.steps.toString()].join(",")),
  ];
  res.header("Content-Type", "text/csv");
  res.send(rows.join("\n"));
});

export default router;
