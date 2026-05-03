import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { toDateOnly, toJsDate } from "../utils/dates";
import { logger } from "../logger";
import { config } from "../config";
import { integrationSyncLimiter } from "../middleware/rateLimit";

const MAX_TOKENS_PER_USER = config.nodeEnv === "production" ? 10 : 50;

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): { plain: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const plain = `ssp_${raw}`;
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

function hashToken(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/** Extract Bearer token from Authorization header. */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/** Resolve a user from a raw integration token string. Returns null if invalid or expired. */
async function resolveTokenUser(plain: string) {
  const hash = hashToken(plain);
  const record = await prisma.integrationToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  // Update last-used timestamp without blocking the response
  prisma.integrationToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch((err: unknown) => logger.warn({ err }, "Failed to update lastUsedAt"));
  return record.user;
}

// ---------------------------------------------------------------------------
// Fitness provider status
// ---------------------------------------------------------------------------

router.get("/fitness", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const fitbitAvail = Boolean(config.oauth.fitbitClientId && config.oauth.fitbitClientSecret);
  const googleAvail = Boolean(config.oauth.googleClientId && config.oauth.googleClientSecret);
  const garminAvail = Boolean(config.oauth.garminClientId && config.oauth.garminClientSecret);

  const [tokenCount, oauthConnections] = await Promise.all([
    prisma.integrationToken.count({ where: { userId: req.user.id } }),
    prisma.oAuthConnection.findMany({
      where: { userId: req.user.id },
      select: { provider: true },
    }),
  ]);

  const oauthSet = new Set(oauthConnections.map((c) => c.provider));

  res.json({
    connected: tokenCount > 0 || oauthConnections.length > 0,
    providers: [
      {
        id: "apple_health",
        name: "Apple Health / Apple Watch",
        available: true,
        connected: tokenCount > 0,
      },
      {
        id: "google_fit",
        name: "Google Fit",
        available: googleAvail,
        connected: oauthSet.has("google_fit"),
      },
      {
        id: "fitbit",
        name: "Fitbit",
        available: fitbitAvail,
        connected: oauthSet.has("fitbit"),
      },
      {
        id: "garmin",
        name: "Garmin Connect",
        available: garminAvail,
        connected: oauthSet.has("garmin"),
      },
    ],
    message:
      googleAvail || fitbitAvail || garminAvail
        ? "Use OAuth for Fitbit, Google Fit, or Garmin Connect (when configured), or generate an integration token for Apple Watch via iOS Shortcuts."
        : "Use an API token for Apple Watch / Health via iOS Shortcuts. Fitbit, Google Fit, and Garmin Connect appear after OAuth credentials are configured on the server.",
  });
});

// ---------------------------------------------------------------------------
// Integration token management (JWT-authenticated)
// ---------------------------------------------------------------------------

const tokenCreateSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  expiresAt: z.string().datetime().optional(),
});

/** POST /api/integrations/tokens — create a new integration token */
router.post("/tokens", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = tokenCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const existing = await prisma.integrationToken.count({ where: { userId: req.user.id } });
  if (existing >= MAX_TOKENS_PER_USER) {
    res.status(422).json({
      error: `Token limit reached (max ${MAX_TOKENS_PER_USER}). Revoke an existing token first.`,
      max: MAX_TOKENS_PER_USER,
    });
    return;
  }

  const label = parsed.data.label ?? "Apple Watch Sync";
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const { plain, hash } = generateToken();

  await prisma.integrationToken.create({
    data: { userId: req.user.id, tokenHash: hash, label, ...(expiresAt ? { expiresAt } : {}) },
  });

  // Return the plaintext token once — it is never stored or retrievable again.
  res.status(201).json({ token: plain, label, expiresAt: expiresAt?.toISOString() ?? null });
});

/** GET /api/integrations/tokens — list the current user's tokens (no plaintext) */
router.get("/tokens", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokens = await prisma.integrationToken.findMany({
    where: { userId: req.user.id },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({ tokens });
});

/** DELETE /api/integrations/tokens/:id — revoke a token */
router.delete("/tokens/:id", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { id } = req.params as { id: string };

  const token = await prisma.integrationToken.findUnique({ where: { id } });
  if (!token || token.userId !== req.user.id) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  await prisma.integrationToken.delete({ where: { id } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Apple Health / Watch sync (token-authenticated)
// ---------------------------------------------------------------------------

const appleHealthRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be ISO YYYY-MM-DD"),
  steps: z.number().int().min(0).max(200_000),
});

const appleHealthSchema = z.object({
  challengeId: z.string().min(1),
  rows: z
    .array(appleHealthRowSchema)
    .min(1)
    .max(31, "max 31 rows per request (one month)")
    .optional(),
  // Convenience single-day shorthand (iOS Shortcut default)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  steps: z.number().int().min(0).max(200_000).optional(),
});

/**
 * POST /api/integrations/apple-health
 *
 * Authenticated via `Authorization: Bearer ssp_<token>` — no session cookie
 * required. Accepts either a single-day shorthand `{ challengeId, date, steps }`
 * or a batch `{ challengeId, rows: [{ date, steps }] }`.
 *
 * This is the endpoint iOS Shortcuts call automatically after reading step
 * count from Apple Health.
 */
router.post("/apple-health", integrationSyncLimiter, async (req, res) => {
  const plain = extractBearerToken(req.headers.authorization);
  if (!plain) {
    res.status(401).json({ error: "Authorization: Bearer <token> required" });
    return;
  }

  const user = await resolveTokenUser(plain);
  if (!user) {
    res.status(401).json({ error: "Invalid or revoked token" });
    return;
  }

  const parsed = appleHealthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { challengeId } = parsed.data;

  // Normalise single-day shorthand into rows array
  let rows: Array<{ date: string; steps: number }>;
  if (parsed.data.rows && parsed.data.rows.length > 0) {
    rows = parsed.data.rows;
  } else if (parsed.data.date !== undefined && parsed.data.steps !== undefined) {
    rows = [{ date: parsed.data.date, steps: parsed.data.steps }];
  } else {
    res.status(400).json({
      error: "Provide either rows[] or both date and steps",
    });
    return;
  }

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  if (challenge.locked) {
    res.status(409).json({ error: "Challenge is locked" });
    return;
  }

  const membership = await prisma.teamMember.findUnique({
    where: { userId_challengeId: { userId: user.id, challengeId: challenge.id } },
  });
  if (!membership) {
    res.status(403).json({ error: "Not enrolled in this challenge" });
    return;
  }

  const tz = challenge.timezone;
  const challengeStart = toDateOnly(
    DateTime.fromJSDate(challenge.startDate, { zone: tz }).toISODate() ?? "",
    tz
  );
  const challengeEnd = toDateOnly(
    DateTime.fromJSDate(challenge.endDate, { zone: tz }).toISODate() ?? "",
    tz
  );

  const prepared: Array<{ date: Date; steps: number }> = [];
  for (const row of rows) {
    const day = toDateOnly(row.date, tz);
    if (day < challengeStart || day > challengeEnd) {
      res.status(400).json({
        error: "One or more rows fall outside the challenge window",
        offendingDate: row.date,
      });
      return;
    }
    prepared.push({ date: toJsDate(day), steps: row.steps });
  }

  const existing = await prisma.stepSubmission.findMany({
    where: {
      userId: user.id,
      challengeId: challenge.id,
      date: { in: prepared.map((r) => r.date) },
    },
    select: { date: true },
  });
  const existingKeys = new Set(existing.map((s) => s.date.getTime()));

  await prisma.$transaction(
    prepared.map((row) =>
      prisma.stepSubmission.upsert({
        where: {
          userId_challengeId_date: { userId: user.id, challengeId: challenge.id, date: row.date },
        },
        update: { steps: row.steps, isFlagged: row.steps > 100_000 },
        create: {
          userId: user.id,
          challengeId: challenge.id,
          date: row.date,
          steps: row.steps,
          isFlagged: row.steps > 100_000,
        },
      })
    )
  );

  const updated = prepared.filter((r) => existingKeys.has(r.date.getTime())).length;
  const imported = prepared.length - updated;

  await prisma.auditLog.create({
    data: {
      action: "apple_health_sync",
      actorId: user.id,
      challengeId: challenge.id,
      metadata: { imported, updated, rows: prepared.length },
    },
  });

  res.json({ imported, updated, skipped: 0 });
});

// ---------------------------------------------------------------------------
// CSV bulk import
// ---------------------------------------------------------------------------

const MAX_CSV_ROWS = 500;

const csvRowSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be ISO YYYY-MM-DD"),
  steps: z.number().int().min(0).max(200_000),
});

const csvImportSchema = z.object({
  challengeId: z.string().min(1),
  rows: z.array(csvRowSchema).min(1),
});

/**
 * Bulk CSV step import.
 *
 * Body: { challengeId, rows: [{ date: "YYYY-MM-DD", steps }] }
 */
router.post("/csv", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const rawRows = (req.body as { rows?: unknown })?.rows;
  if (Array.isArray(rawRows) && rawRows.length > MAX_CSV_ROWS) {
    res.status(413).json({
      error: `Too many rows (max ${MAX_CSV_ROWS})`,
      max: MAX_CSV_ROWS,
    });
    return;
  }

  const parsed = csvImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CSV import payload" });
    return;
  }

  const { challengeId, rows } = parsed.data;

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  if (challenge.locked) {
    res.status(409).json({ error: "Challenge is locked" });
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

  const userId = req.user.id;
  const tz = challenge.timezone;
  const challengeStart = toDateOnly(
    DateTime.fromJSDate(challenge.startDate, { zone: tz }).toISODate() ?? "",
    tz
  );
  const challengeEnd = toDateOnly(
    DateTime.fromJSDate(challenge.endDate, { zone: tz }).toISODate() ?? "",
    tz
  );

  const prepared: Array<{ date: Date; steps: number }> = [];
  for (const row of rows) {
    const day = toDateOnly(row.date, tz);
    if (day < challengeStart || day > challengeEnd) {
      res.status(400).json({
        error: "One or more rows fall outside the challenge window",
        offendingDate: row.date,
      });
      return;
    }
    prepared.push({ date: toJsDate(day), steps: row.steps });
  }

  const existing = await prisma.stepSubmission.findMany({
    where: {
      userId,
      challengeId: challenge.id,
      date: { in: prepared.map((r) => r.date) },
    },
    select: { date: true },
  });
  const existingKeys = new Set(existing.map((s) => s.date.getTime()));

  await prisma.$transaction(
    prepared.map((row) =>
      prisma.stepSubmission.upsert({
        where: {
          userId_challengeId_date: {
            userId,
            challengeId: challenge.id,
            date: row.date,
          },
        },
        update: {
          steps: row.steps,
          isFlagged: row.steps > 100_000,
        },
        create: {
          userId,
          challengeId: challenge.id,
          date: row.date,
          steps: row.steps,
          isFlagged: row.steps > 100_000,
        },
      })
    )
  );

  const updated = prepared.filter((r) => existingKeys.has(r.date.getTime())).length;
  const imported = prepared.length - updated;
  const skipped = 0;

  await prisma.auditLog.create({
    data: {
      action: "csv_import",
      actorId: userId,
      challengeId: challenge.id,
      metadata: { imported, updated },
    },
  });

  res.json({ imported, updated, skipped });
});

export default router;
