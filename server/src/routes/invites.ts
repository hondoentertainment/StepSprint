import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired, roleRequired, AuthenticatedRequest } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const INVITE_EXPIRY = "7d";

/** Admin: create invite link for a challenge */
router.post("/", authRequired, roleRequired(Role.ADMIN), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ challengeId: z.string(), email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "challengeId and email required" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({ where: { id: parsed.data.challengeId } });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  const token = jwt.sign(
    {
      type: "invite",
      challengeId: parsed.data.challengeId,
      email: parsed.data.email,
    },
    config.jwtSecret,
    { expiresIn: INVITE_EXPIRY }
  );

  const baseUrl = config.appOrigin.replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/invite?token=${token}`;
  res.json({ inviteUrl, expiresIn: INVITE_EXPIRY });
});

/** Public: accept invite (enrolls user and returns session) */
router.get("/accept", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }

  let payload: { type?: string; challengeId?: string; email?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as { type?: string; challengeId?: string; email?: string };
  } catch {
    res.status(400).json({ error: "Invalid or expired invite" });
    return;
  }

  if (payload.type !== "invite" || !payload.challengeId || !payload.email) {
    res.status(400).json({ error: "Invalid invite" });
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: {},
    create: { email: payload.email },
  });

  await prisma.teamMember.upsert({
    where: {
      userId_challengeId: { userId: user.id, challengeId: payload.challengeId },
    },
    update: {},
    create: { userId: user.id, challengeId: payload.challengeId },
  });

  const challenge = await prisma.challenge.findUnique({
    where: { id: payload.challengeId },
    select: { name: true },
  });

  const sessionToken = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: "30d" });
  res.cookie(config.cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    challengeId: payload.challengeId,
    challengeName: challenge?.name,
  });
});

export default router;
