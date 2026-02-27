import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { passwordResetLimiter } from "../middleware/rateLimit";
import {
  hashPassword,
  verifyPassword,
  passwordSchema,
} from "../utils/password";
import {
  generateResetToken,
  hashResetToken,
  verifyResetToken,
} from "../utils/resetToken";
import { sendEmail } from "../services/email";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
};

function issueSession(userId: string, role: string) {
  const token = jwt.sign({ sub: userId, role }, config.jwtSecret, {
    expiresIn: "30d",
  });
  return token;
}

/* ------------------------------------------------------------------ */
/*  POST /login                                                       */
/* ------------------------------------------------------------------ */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Constant-time: hash anyway to prevent timing attacks
    await hashPassword(password);
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.passwordHash) {
    // Legacy user who never set a password
    res.status(403).json({
      error: "PASSWORD_SETUP_REQUIRED",
      message:
        "You need to set a password. Please create an account with your email to set one.",
    });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = issueSession(user.id, user.role);
  res.cookie(config.cookieName, token, cookieOptions);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

/* ------------------------------------------------------------------ */
/*  POST /register                                                    */
/* ------------------------------------------------------------------ */
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: passwordSchema,
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    res.status(400).json({ error: messages.join("; ") });
    return;
  }

  const { email, name, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.passwordHash) {
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }
    // Legacy user: let them set a password
    const hash = await hashPassword(password);
    const user = await prisma.user.update({
      where: { email },
      data: { passwordHash: hash, name: name ?? existing.name },
    });
    const token = issueSession(user.id, user.role);
    res.cookie(config.cookieName, token, cookieOptions);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    return;
  }

  const hash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash: hash },
  });

  const token = issueSession(user.id, user.role);
  res.cookie(config.cookieName, token, cookieOptions);
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

/* ------------------------------------------------------------------ */
/*  POST /forgot-password                                             */
/* ------------------------------------------------------------------ */
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user) {
    res.json({
      ok: true,
      message: "If that email exists, a reset link has been sent.",
    });
    return;
  }

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const plainToken = generateResetToken();
  const tokenHash = await hashResetToken(plainToken);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  const resetUrl = `${config.appOrigin}/reset-password?token=${plainToken}&email=${encodeURIComponent(email)}`;

  await sendEmail({
    to: email,
    subject: "StepSprint Password Reset",
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });

  res.json({
    ok: true,
    message: "If that email exists, a reset link has been sent.",
  });
});

/* ------------------------------------------------------------------ */
/*  POST /reset-password                                              */
/* ------------------------------------------------------------------ */
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    res.status(400).json({ error: messages.join("; ") });
    return;
  }

  const { token, email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  // Find valid (unused, not expired) tokens for this user
  const resetTokens = await prisma.passwordResetToken.findMany({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  let matchedToken: (typeof resetTokens)[0] | null = null;
  for (const rt of resetTokens) {
    if (await verifyResetToken(token, rt.tokenHash)) {
      matchedToken = rt;
      break;
    }
  }

  if (!matchedToken) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  const hash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    }),
    prisma.passwordResetToken.update({
      where: { id: matchedToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true, message: "Password has been reset. You can now sign in." });
});

/* ------------------------------------------------------------------ */
/*  POST /change-password  (authenticated)                            */
/* ------------------------------------------------------------------ */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

router.post(
  "/change-password",
  authRequired,
  async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      res.status(400).json({ error: messages.join("; ") });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: "No password set for this account" });
      return;
    }

    const valid = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash
    );
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });

    res.json({ ok: true, message: "Password updated successfully" });
  }
);

/* ------------------------------------------------------------------ */
/*  GET /me                                                           */
/* ------------------------------------------------------------------ */
router.get("/me", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json({ user });
});

/* ------------------------------------------------------------------ */
/*  POST /logout                                                      */
/* ------------------------------------------------------------------ */
router.post("/logout", (_req, res) => {
  res.clearCookie(config.cookieName);
  res.json({ ok: true });
});

export default router;
