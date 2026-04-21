import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired, roleRequired, AuthenticatedRequest } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const INVITE_EXPIRY = "7d";
/** Default lifetime for a rotatable per-challenge invite code. */
export const INVITE_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Generate a short, URL-safe invite code. */
function generateInviteCode(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/** Compute a new expiry date for an invite code. */
function inviteCodeExpiry(): Date {
  return new Date(Date.now() + INVITE_CODE_TTL_MS);
}

/* ------------------------------------------------------------------ */
/*  POST /  (admin)  — create JWT-based per-email invite link          */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  POST /:challengeId/code  (admin) — generate/rotate challenge code  */
/* ------------------------------------------------------------------ */
router.post(
  "/:challengeId/code",
  authRequired,
  roleRequired(Role.ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const { challengeId } = req.params;
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }

    // Avoid a (rare) collision on the unique index.
    let code = generateInviteCode();
    for (let i = 0; i < 3; i++) {
      const existing = await prisma.challenge.findUnique({ where: { inviteCode: code } });
      if (!existing) break;
      code = generateInviteCode();
    }

    const expiresAt = inviteCodeExpiry();
    const updated = await prisma.challenge.update({
      where: { id: challengeId },
      data: { inviteCode: code, inviteCodeExpiresAt: expiresAt },
      select: { id: true, name: true, inviteCode: true, inviteCodeExpiresAt: true },
    });

    res.json({
      code: updated.inviteCode,
      expiresAt: updated.inviteCodeExpiresAt,
      challengeId: updated.id,
      challengeName: updated.name,
    });
  }
);

/* ------------------------------------------------------------------ */
/*  GET /accept  — accept a JWT-based per-email invite (legacy).      */
/*  Declared BEFORE `GET /:code` so literal path wins over param.     */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  GET /:code  — look up a challenge by invite code (public)          */
/* ------------------------------------------------------------------ */
router.get("/:code", async (req, res) => {
  const { code } = req.params;
  if (!code) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      inviteCodeExpiresAt: true,
    },
  });

  if (!challenge || !challenge.inviteCode) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (challenge.inviteCodeExpiresAt && challenge.inviteCodeExpiresAt.getTime() <= Date.now()) {
    res.status(410).json({ error: "Invite has expired" });
    return;
  }

  res.json({
    challengeId: challenge.id,
    challengeName: challenge.name,
    expiresAt: challenge.inviteCodeExpiresAt,
  });
});

/* ------------------------------------------------------------------ */
/*  POST /:code/accept  — join challenge via invite code               */
/* ------------------------------------------------------------------ */
router.post("/:code/accept", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { code } = req.params;
  const challenge = await prisma.challenge.findUnique({
    where: { inviteCode: code },
    select: { id: true, name: true, inviteCodeExpiresAt: true, inviteCode: true },
  });

  if (!challenge || !challenge.inviteCode) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (challenge.inviteCodeExpiresAt && challenge.inviteCodeExpiresAt.getTime() <= Date.now()) {
    res.status(410).json({ error: "Invite has expired" });
    return;
  }

  await prisma.teamMember.upsert({
    where: { userId_challengeId: { userId: req.user.id, challengeId: challenge.id } },
    update: {},
    create: { userId: req.user.id, challengeId: challenge.id },
  });

  res.json({ challengeId: challenge.id, challengeName: challenge.name });
});

export default router;
