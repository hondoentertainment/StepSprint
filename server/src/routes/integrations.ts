import { Router } from "express";
import { z } from "zod";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { toDateOnly, toJsDate } from "../utils/dates";

const router = Router();

/** Fitness integration status (stub for future Google Fit, Apple Health, Fitbit) */
router.get("/fitness", authRequired, async (_req: AuthenticatedRequest, res) => {
  res.json({
    connected: false,
    providers: [
      { id: "google_fit", name: "Google Fit", available: false },
      { id: "apple_health", name: "Apple Health", available: false },
      { id: "fitbit", name: "Fitbit", available: false },
    ],
    message: "Fitness integrations coming soon. For now, log steps manually.",
  });
});

// Cap rows per request so a pathological payload can't spin up a huge Prisma
// transaction. The client is expected to chunk larger imports.
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
 * The client reads the CSV in the browser and POSTs JSON so we don't need a
 * multipart parser on the server. The whole batch is validated up front
 * (Zod all-or-nothing) and then upserted inside a single Prisma transaction
 * on the `(userId, challengeId, date)` unique key.
 */
router.post("/csv", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Row cap check comes before Zod so an oversized payload returns 413 rather
  // than a generic 400. We only peek at `rows.length` without trusting any
  // other field yet.
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

  // Resolve each row's date in the challenge timezone up front. Rows that
  // fall outside the challenge window are surfaced as 400 for the whole
  // request rather than silently dropped, so the caller can fix the source
  // CSV. `skipped` stays reserved for a future partial-parse mode.
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
