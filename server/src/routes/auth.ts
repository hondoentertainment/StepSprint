import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { passwordResetLimiter, loginLimiter } from "../middleware/rateLimit";
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
import { sessionCookieClearOptions, sessionCookieOptions } from "../cookies";
import { normalizeEmail } from "../utils/email";

const router = Router();

function issueSession(userId: string, role: string, tokenVersion: number) {
  return jwt.sign({ sub: userId, role, ver: tokenVersion }, config.jwtSecret, {
    expiresIn: "30d",
  });
}

// ---------------------------------------------------------------------------
// Email verification helpers
// ---------------------------------------------------------------------------
function generateVerificationToken(): { plain: string; hash: string } {
  const plain = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

async function sendVerificationEmail(
  emailRaw: string,
  userId: string
): Promise<void> {
  const email = normalizeEmail(emailRaw);
  // Invalidate any existing unused tokens.
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { plain, hash } = generateVerificationToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  const verifyUrl = `${config.appOrigin}/verify-email?token=${plain}&email=${encodeURIComponent(email)}`;
  await sendEmail({
    to: email,
    subject: "Verify your StepSprint email address",
    text: `Please verify your email address by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create a StepSprint account, you can safely ignore this email.`,
    html: `<p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

/* ------------------------------------------------------------------ */
/*  POST /login                                                       */
/* ------------------------------------------------------------------ */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const isProduction = process.env.NODE_ENV === "production";

router.post("/login", ...(isProduction ? [loginLimiter] : []), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });

  if (!user) {
    await hashPassword(password); // constant-time to prevent timing attacks
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.passwordHash) {
    res.status(403).json({
      error: "PASSWORD_SETUP_REQUIRED",
      message:
        "You need to set a password. Please register with your email to set one.",
    });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({
      error: "EMAIL_VERIFICATION_REQUIRED",
      message:
        "Please verify your email address before logging in. Check your inbox for a verification link.",
    });
    return;
  }

  const token = issueSession(user.id, user.role, user.tokenVersion);
  res.cookie(config.cookieName, token, sessionCookieOptions);
  res.json({
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
  const emailNorm = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: emailNorm } });

  if (existing) {
    if (existing.passwordHash) {
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }
    // Admin-provisioned user (no password yet) — let them set a password.
    // These users are pre-verified since an admin explicitly added them.
    const hash = await hashPassword(password);
    const user = await prisma.user.update({
      where: { email: emailNorm },
      data: {
        passwordHash: hash,
        name: name ?? existing.name,
        emailVerified: true,
      },
    });
    const token = issueSession(user.id, user.role, user.tokenVersion);
    res.cookie(config.cookieName, token, sessionCookieOptions);
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
    data: { email: emailNorm, name, passwordHash: hash },
  });

  await sendVerificationEmail(emailNorm, user.id).catch(() => {
    // Non-fatal — user can request a new verification email.
  });

  res.status(201).json({
    ok: true,
    message:
      "Account created. Please check your email for a verification link before logging in.",
  });
});

/* ------------------------------------------------------------------ */
/*  POST /resend-verification                                         */
/* ------------------------------------------------------------------ */
router.post("/resend-verification", ...(isProduction ? [loginLimiter] : []), async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Always return success to prevent email enumeration.
  if (!user || user.emailVerified) {
    res.json({ ok: true, message: "If applicable, a new verification email has been sent." });
    return;
  }

  await sendVerificationEmail(email, user.id).catch(() => {});
  res.json({ ok: true, message: "If applicable, a new verification email has been sent." });
});

/* ------------------------------------------------------------------ */
/*  POST /verify-email                                                */
/* ------------------------------------------------------------------ */
const verifyEmailSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
});

router.post("/verify-email", async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid verification link" });
    return;
  }

  const { token, email } = parsed.data;
  const emailNorm = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
  });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired verification link" });
    return;
  }

  if (user.emailVerified) {
    res.json({ ok: true, message: "Email already verified. You can log in." });
    return;
  }

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.emailVerificationToken.findFirst({
    where: {
      userId: user.id,
      tokenHash: hash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    res.status(400).json({ error: "Invalid or expired verification link" });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true, message: "Email verified. You can now log in." });
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
  const emailNorm = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
  });

  // Always return success to prevent email enumeration.
  if (!user) {
    res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
    return;
  }

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

  const resetUrl = `${config.appOrigin}/reset-password?token=${encodeURIComponent(plainToken)}&email=${encodeURIComponent(user.email)}`;
  await sendEmail({
    to: user.email,
    subject: "StepSprint Password Reset",
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });

  res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
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
  const emailNorm = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
  });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

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
      // Increment tokenVersion to invalidate all existing sessions.
      data: { passwordHash: hash, tokenVersion: { increment: 1 } },
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

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: "No password set for this account" });
      return;
    }

    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hash = await hashPassword(parsed.data.newPassword);
    // Increment tokenVersion so all other active sessions are invalidated.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, tokenVersion: { increment: 1 } },
    });

    // Re-issue a fresh session cookie for the current device.
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { tokenVersion: true, role: true },
    });
    const token = issueSession(user.id, updated.role, updated.tokenVersion);
    res.cookie(config.cookieName, token, sessionCookieOptions);

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
router.post("/logout", authRequired, async (req: AuthenticatedRequest, res) => {
  if (req.user) {
    // Increment tokenVersion to invalidate this session and any concurrent
    // sessions on other devices (e.g. remembered browsers).
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });
  }
  res.clearCookie(config.cookieName, sessionCookieClearOptions);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  DELETE /me  — account deletion (requires password confirmation)  */
/* ------------------------------------------------------------------ */
const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

router.delete(
  "/me",
  authRequired,
  async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password confirmation required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: "Cannot delete account" });
      return;
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Password is incorrect" });
      return;
    }

    // Cascade: TeamMember, StepSubmission, IntegrationToken, OAuthConnection,
    // PushSubscription are ON DELETE CASCADE. AuditLog actor is SET NULL.
    // PasswordResetToken and EmailVerificationToken are RESTRICT, so delete first.
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
      prisma.notificationPreference.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);

    res.clearCookie(config.cookieName, sessionCookieClearOptions);
    res.json({ ok: true, message: "Account deleted." });
  }
);

export default router;
