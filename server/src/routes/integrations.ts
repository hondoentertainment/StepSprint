import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { DateTime } from "luxon";
import { FitnessProvider } from "@prisma/client";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { config } from "../config";
import { prisma } from "../prisma";
import { sealSecret } from "../utils/cryptoSecret";
import { toDateOnly, toJsDate } from "../utils/dates";
import { fitbitConfigured, fitbitExchangeCode, fitbitFetchProfileUserId } from "../services/fitness/fitbitApi";
import { googleFitConfigured, googleExchangeCode } from "../services/fitness/googleFitApi";
import { fitnessProviderSlug, parseFitnessProviderSlug } from "../services/fitness/providers";
import { syncFitnessForUser } from "../services/fitness/syncService";

const router = Router();

const STATE_TTL_MIN = 15;
const MAX_IMPORT_ROWS = 500;
const MAX_STEPS = 250_000;

const TOKEN_PREFIX = "ssp_";
const DEFAULT_TOKEN_LABEL = "Apple Watch Sync";

function callbackUrl(providerSlug: string): string {
  return `${config.apiPublicUrl}/api/integrations/fitness/oauth/${providerSlug}/callback`;
}

function hashIntegrationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const stepRowSchema = z.object({
  date: z.string().min(1),
  steps: z.number().int().min(0).max(MAX_STEPS),
});

type StepRow = z.infer<typeof stepRowSchema>;
type ImportResult =
  | { ok: true; imported: number; updated: number; skipped: number }
  | { ok: false; status: number; error: string };

/**
 * Upserts a batch of {date, steps} rows for a user/challenge. Rows are
 * validated against the challenge window; duplicate dates within one batch
 * collapse to the highest step count. Returns per-row create/update counts.
 */
async function importStepRows(
  userId: string,
  challengeId: string,
  rows: StepRow[],
  source: "csv" | "apple_health"
): Promise<ImportResult> {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, status: 404, error: "Challenge not found" };
  if (challenge.locked) return { ok: false, status: 409, error: "This challenge is locked" };

  const membership = await prisma.teamMember.findUnique({
    where: { userId_challengeId: { userId, challengeId } },
  });
  if (!membership) return { ok: false, status: 403, error: "Not enrolled in this challenge" };

  const tz = challenge.timezone;
  const start = toDateOnly(
    DateTime.fromJSDate(challenge.startDate, { zone: tz }).toISODate() ?? "",
    tz
  );
  const end = toDateOnly(
    DateTime.fromJSDate(challenge.endDate, { zone: tz }).toISODate() ?? "",
    tz
  );

  // Collapse duplicate dates to the highest step count.
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const d = toDateOnly(row.date, tz);
    if (!d.isValid) return { ok: false, status: 400, error: "Invalid date" };
    if (d < start || d > end) {
      return { ok: false, status: 400, error: "Date is outside the challenge window" };
    }
    const key = d.toISODate() as string;
    byDate.set(key, Math.max(byDate.get(key) ?? 0, row.steps));
  }

  let imported = 0;
  let updated = 0;
  for (const [iso, steps] of byDate) {
    const date = toJsDate(toDateOnly(iso, tz));
    const existing = await prisma.stepSubmission.findUnique({
      where: { userId_challengeId_date: { userId, challengeId, date } },
      select: { id: true },
    });
    await prisma.stepSubmission.upsert({
      where: { userId_challengeId_date: { userId, challengeId, date } },
      update: { steps, isFlagged: steps > 100_000 },
      create: { userId, challengeId, date, steps, isFlagged: steps > 100_000 },
    });
    if (existing) updated += 1;
    else imported += 1;
  }

  await prisma.auditLog.create({
    data: {
      action: source === "csv" ? "csv_import" : "apple_health_sync",
      actorId: userId,
      challengeId,
    },
  });

  return { ok: true, imported, updated, skipped: 0 };
}

router.get("/fitness", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const userId = req.user.id;
  const challengeId =
    typeof req.query.challengeId === "string" && req.query.challengeId.length > 0
      ? req.query.challengeId
      : null;

  const [oauthConnections, tokens] = await Promise.all([
    prisma.oAuthConnection.findMany({
      where: { userId },
      select: { provider: true, createdAt: true },
    }),
    prisma.integrationToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const oauthByProvider = new Map(oauthConnections.map((c) => [c.provider, c]));
  const appleConnected = tokens.length > 0;
  const appleConnectedAt = appleConnected ? tokens[0].createdAt.toISOString() : null;

  // lastSyncedAt / lastAppleHealthSyncAt are scoped to a challenge's audit log.
  async function lastSyncFor(action: string): Promise<string | null> {
    if (!challengeId) return null;
    const row = await prisma.auditLog.findFirst({
      where: { actorId: userId, challengeId, action },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return row ? row.createdAt.toISOString() : null;
  }

  const [fitbitSync, googleSync, appleSync, garminSync] = await Promise.all([
    lastSyncFor("fitbit_sync"),
    lastSyncFor("google_fit_sync"),
    lastSyncFor("apple_health_sync"),
    lastSyncFor("garmin_sync"),
  ]);

  const connectedAtFor = (provider: string): string | null => {
    const c = oauthByProvider.get(provider);
    return c ? c.createdAt.toISOString() : null;
  };

  const providers = [
    {
      id: "fitbit",
      name: "Fitbit",
      available: fitbitConfigured(),
      connectPath: "/api/integrations/fitness/oauth/fitbit/start",
      connected: oauthByProvider.has("fitbit"),
      connectedAt: connectedAtFor("fitbit"),
      lastSyncedAt: fitbitSync,
    },
    {
      id: "google_fit",
      name: "Google Fit / Health",
      available: googleFitConfigured(),
      connectPath: "/api/integrations/fitness/oauth/google_fit/start",
      connected: oauthByProvider.has("google_fit"),
      connectedAt: connectedAtFor("google_fit"),
      lastSyncedAt: googleSync,
      note: "Uses Google Fitness REST (activity read).",
    },
    {
      id: "apple_health",
      name: "Apple Health",
      available: true,
      connected: appleConnected,
      connectedAt: appleConnectedAt,
      lastSyncedAt: appleSync,
      note: "Sync from the StepSprint iOS Shortcut using an integration token.",
    },
    {
      id: "garmin",
      name: "Garmin",
      available: false,
      connected: oauthByProvider.has("garmin"),
      connectedAt: connectedAtFor("garmin"),
      lastSyncedAt: garminSync,
    },
  ];

  res.json({
    connected: oauthConnections.length > 0 || appleConnected,
    providers,
    lastAppleHealthSyncAt: appleSync,
    message:
      oauthConnections.length > 0 || appleConnected
        ? "Fitness sync runs periodically; use “Sync now” on Submit to pull the latest steps."
        : "Connect a provider or generate an integration token to import steps. Manual entries are never overwritten.",
  });
});

/* ------------------------------------------------------------------ */
/*  POST /csv  — bulk import via authenticated dashboard upload       */
/* ------------------------------------------------------------------ */
router.post("/csv", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const body = req.body as { challengeId?: unknown; rows?: unknown };
  if (typeof body?.challengeId !== "string" || !Array.isArray(body.rows)) {
    res.status(400).json({ error: "challengeId and rows are required" });
    return;
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    res.status(413).json({ error: "Too many rows", max: MAX_IMPORT_ROWS });
    return;
  }

  const rowsParsed = z.array(stepRowSchema).safeParse(body.rows);
  if (!rowsParsed.success) {
    res.status(400).json({ error: "Invalid rows payload" });
    return;
  }

  const result = await importStepRows(req.user.id, body.challengeId, rowsParsed.data, "csv");
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ imported: result.imported, updated: result.updated, skipped: result.skipped });
});

/* ------------------------------------------------------------------ */
/*  Integration tokens  — long-lived bearer tokens for device sync    */
/* ------------------------------------------------------------------ */
router.post("/tokens", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const label =
    typeof req.body?.label === "string" && req.body.label.trim().length > 0
      ? req.body.label.trim()
      : DEFAULT_TOKEN_LABEL;

  const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  await prisma.integrationToken.create({
    data: { userId: req.user.id, tokenHash: hashIntegrationToken(token), label },
  });

  res.status(201).json({ token, label });
});

router.get("/tokens", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const tokens = await prisma.integrationToken.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  });
  res.json({ tokens });
});

router.delete("/tokens/:id", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const result = await prisma.integrationToken.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "Token not found" });
    return;
  }
  res.status(204).send();
});

/* ------------------------------------------------------------------ */
/*  POST /apple-health  — bearer-token sync from the iOS Shortcut      */
/* ------------------------------------------------------------------ */
const appleHealthSchema = z.union([
  z.object({
    challengeId: z.string().min(1),
    rows: z.array(stepRowSchema).min(1).max(MAX_IMPORT_ROWS),
  }),
  z.object({
    challengeId: z.string().min(1),
    date: z.string().min(1),
    steps: z.number().int().min(0).max(MAX_STEPS),
  }),
]);

router.post("/apple-health", async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    res.status(401).json({ error: "Integration token required" });
    return;
  }

  const record = await prisma.integrationToken.findUnique({
    where: { tokenHash: hashIntegrationToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!record || (record.expiresAt && record.expiresAt < new Date())) {
    res.status(401).json({ error: "Invalid integration token" });
    return;
  }

  const parsed = appleHealthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide either rows[] or date + steps" });
    return;
  }

  const rows =
    "rows" in parsed.data
      ? parsed.data.rows
      : [{ date: parsed.data.date, steps: parsed.data.steps }];

  const result = await importStepRows(record.userId, parsed.data.challengeId, rows, "apple_health");
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await prisma.integrationToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  res.json({ imported: result.imported, updated: result.updated, skipped: result.skipped });
});

router.post("/fitness/sync", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const result = await syncFitnessForUser(req.user.id);
  res.json({ ok: true, daysWritten: result.daysWritten });
});

router.delete("/fitness/:provider", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const provider = parseFitnessProviderSlug(req.params.provider);
  if (!provider) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  await prisma.fitnessConnection.deleteMany({
    where: { userId: req.user.id, provider },
  });
  res.json({ ok: true });
});

router.get("/fitness/oauth/:provider/start", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const provider = parseFitnessProviderSlug(req.params.provider);
  if (!provider) {
    res.status(400).send("Unknown provider");
    return;
  }

  if (provider === FitnessProvider.FITBIT && !fitbitConfigured()) {
    res.status(503).send("Fitbit OAuth is not configured (set FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET).");
    return;
  }
  if (provider === FitnessProvider.GOOGLE_FIT && !googleFitConfigured()) {
    res.status(503).send("Google OAuth is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).");
    return;
  }

  const slug = fitnessProviderSlug(provider);
  const redirectUri = callbackUrl(slug);
  const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60_000);

  await prisma.fitnessOAuthState.deleteMany({
    where: { userId: req.user.id, provider },
  });
  const state = await prisma.fitnessOAuthState.create({
    data: {
      userId: req.user.id,
      provider,
      expiresAt,
    },
  });

  if (provider === FitnessProvider.FITBIT) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.fitbitClientId ?? "",
      redirect_uri: redirectUri,
      scope: "activity",
      state: state.id,
    });
    res.redirect(`https://www.fitbit.com/oauth2/authorize?${params.toString()}`);
    return;
  }

  const scope = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "openid",
    "email",
  ].join(" ");
  const params = new URLSearchParams({
    client_id: config.googleClientId ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: state.id,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/fitness/oauth/:provider/callback", async (req, res) => {
  const provider = parseFitnessProviderSlug(req.params.provider);
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateId = typeof req.query.state === "string" ? req.query.state : "";
  const err = typeof req.query.error === "string" ? req.query.error : "";

  const redirectBack = (qs: string) => {
    res.redirect(`${config.appOrigin}/submit${qs}`);
  };

  if (err) {
    redirectBack(`?fitness=error&message=${encodeURIComponent(err)}`);
    return;
  }
  if (!provider || !code || !stateId) {
    redirectBack(`?fitness=error&message=${encodeURIComponent("Missing code or state")}`);
    return;
  }

  const row = await prisma.fitnessOAuthState.findUnique({ where: { id: stateId } });
  if (!row || row.provider !== provider || row.expiresAt < new Date()) {
    redirectBack(`?fitness=error&message=${encodeURIComponent("Invalid or expired session")}`);
    return;
  }

  const slug = fitnessProviderSlug(provider);
  const redirectUri = callbackUrl(slug);

  try {
    if (provider === FitnessProvider.FITBIT) {
      const tokens = await fitbitExchangeCode(code, redirectUri);
      const userId = row.userId;
      const access = tokens.access_token;
      const refresh = tokens.refresh_token;
      const expiresIn = tokens.expires_in;
      const profileId = await fitbitFetchProfileUserId(access);

      await prisma.$transaction([
        prisma.fitnessOAuthState.delete({ where: { id: stateId } }),
        prisma.fitnessConnection.upsert({
          where: { userId_provider: { userId, provider } },
          create: {
            userId,
            provider,
            accessTokenEnc: sealSecret(access),
            refreshTokenEnc: refresh ? sealSecret(refresh) : null,
            expiresAt:
              typeof expiresIn === "number"
                ? new Date(Date.now() + expiresIn * 1000 - 60_000)
                : null,
            externalUserId: profileId,
          },
          update: {
            accessTokenEnc: sealSecret(access),
            ...(refresh ? { refreshTokenEnc: sealSecret(refresh) } : {}),
            expiresAt:
              typeof expiresIn === "number"
                ? new Date(Date.now() + expiresIn * 1000 - 60_000)
                : null,
            externalUserId: profileId,
          },
        }),
      ]);
      redirectBack(`?fitness=connected&p=${slug}`);
      return;
    }

    if (provider === FitnessProvider.GOOGLE_FIT) {
      const tokens = await googleExchangeCode(code, redirectUri);
      const userId = row.userId;
      const access = tokens.access_token;
      const refresh = tokens.refresh_token;
      const expiresIn = tokens.expires_in;

      await prisma.$transaction([
        prisma.fitnessOAuthState.delete({ where: { id: stateId } }),
        prisma.fitnessConnection.upsert({
          where: { userId_provider: { userId, provider } },
          create: {
            userId,
            provider,
            accessTokenEnc: sealSecret(access),
            refreshTokenEnc: refresh ? sealSecret(refresh) : null,
            expiresAt:
              typeof expiresIn === "number"
                ? new Date(Date.now() + expiresIn * 1000 - 60_000)
                : null,
            externalUserId: "google",
          },
          update: {
            accessTokenEnc: sealSecret(access),
            refreshTokenEnc: refresh ? sealSecret(refresh) : undefined,
            expiresAt:
              typeof expiresIn === "number"
                ? new Date(Date.now() + expiresIn * 1000 - 60_000)
                : null,
          },
        }),
      ]);
      redirectBack(`?fitness=connected&p=${slug}`);
      return;
    }

    redirectBack(`?fitness=error&message=${encodeURIComponent("Unsupported provider")}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth failed";
    redirectBack(`?fitness=error&message=${encodeURIComponent(message)}`);
  }
});

/** Legacy POST entrypoint — returns absolute URL for GET …/start */
router.post("/fitness/oauth/:provider", authRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = z.enum(["fitbit", "google_fit"]).safeParse(req.params.provider);
  if (!parsed.success) {
    res.status(400).json({ error: "Unsupported provider" });
    return;
  }
  res.json({
    redirect: `${config.apiPublicUrl}/api/integrations/fitness/oauth/${parsed.data}/start`,
  });
});

export default router;
