/**
 * OAuth 2.0 flows for Fitbit and Google Fit.
 *
 * All four env vars are optional — when absent the provider is reported as
 * unavailable and connect/sync routes return 503. This lets the server start
 * without OAuth credentials in dev while enabling full flows in prod via env.
 *
 * Required env vars per provider:
 *   Fitbit:     FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET
 *   Google Fit: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * Callback URLs (register in each provider console) must match this app's
 * canonical API base (`API_PUBLIC_ORIGIN`, defaulting to `APP_ORIGIN`):
 *   Fitbit:     {API_PUBLIC_ORIGIN}/api/integrations/fitbit/callback
 *   Google Fit: {API_PUBLIC_ORIGIN}/api/integrations/google-fit/callback
 */
import { Router } from "express";
import { z } from "zod";
import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { toDateOnly, toJsDate } from "../utils/dates";
import { config } from "../config";
import { integrationSyncLimiter } from "../middleware/rateLimit";
import { logger } from "../logger";

const router = Router();

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

type ProviderConfig = {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string | undefined;
  clientSecret: string | undefined;
};

const FITBIT: ProviderConfig = {
  id: "fitbit",
  name: "Fitbit",
  authUrl: "https://www.fitbit.com/oauth2/authorize",
  tokenUrl: "https://api.fitbit.com/oauth2/token",
  scopes: ["activity"],
  clientId: config.oauth.fitbitClientId,
  clientSecret: config.oauth.fitbitClientSecret,
};

const GOOGLE_FIT: ProviderConfig = {
  id: "google_fit",
  name: "Google Fit",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/fitness.activity.read"],
  clientId: config.oauth.googleClientId,
  clientSecret: config.oauth.googleClientSecret,
};

function callbackUrl(provider: ProviderConfig): string {
  return `${config.apiPublicOrigin}/api/integrations/${provider.id.replace("_", "-")}/callback`;
}

function isAvailable(p: ProviderConfig) {
  return Boolean(p.clientId && p.clientSecret);
}

// ---------------------------------------------------------------------------
// Token exchange helpers
// ---------------------------------------------------------------------------

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  user_id?: string; // Fitbit
};

async function exchangeCode(
  provider: ProviderConfig,
  code: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(provider),
    client_id: provider.clientId!,
    client_secret: provider.clientSecret!,
  });

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(
  provider: ProviderConfig,
  refreshToken: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: provider.clientId!,
    client_secret: provider.clientSecret!,
  });

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/** Ensure the stored access token is fresh, refreshing if needed. */
async function ensureFreshToken(
  connection: { accessToken: string; refreshToken: string | null; expiresAt: Date | null; id: string },
  provider: ProviderConfig
): Promise<string> {
  const bufferMs = 5 * 60 * 1000; // 5-minute safety buffer
  if (!connection.expiresAt || connection.expiresAt.getTime() - bufferMs > Date.now()) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) {
    throw new Error("Access token expired and no refresh token available. Please reconnect.");
  }
  const tokens = await refreshAccessToken(provider, connection.refreshToken);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    },
  });
  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Step-fetch helpers (provider-specific)
// ---------------------------------------------------------------------------

type DaySteps = { date: string; steps: number };

async function fetchFitbitSteps(accessToken: string, dateISO: string): Promise<DaySteps[]> {
  const url = `https://api.fitbit.com/1/user/-/activities/steps/date/${dateISO}/1d.json`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Fitbit API error (${res.status})`);
  }
  const data = (await res.json()) as { "activities-steps": Array<{ dateTime: string; value: string }> };
  return (data["activities-steps"] ?? []).map((e) => ({
    date: e.dateTime,
    steps: parseInt(e.value, 10) || 0,
  }));
}

async function fetchGoogleFitSteps(accessToken: string, dateISO: string): Promise<DaySteps[]> {
  const startMs = DateTime.fromISO(dateISO).startOf("day").toMillis();
  const endMs = DateTime.fromISO(dateISO).endOf("day").toMillis();

  const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: startMs,
      endTimeMillis: endMs,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Fit API error (${res.status})`);
  }
  type Bucket = { startTimeMillis: string; dataset: Array<{ point: Array<{ value: Array<{ intVal?: number }> }> }> };
  const data = (await res.json()) as { bucket?: Bucket[] };
  return (data.bucket ?? []).map((bucket) => {
    const steps = bucket.dataset[0]?.point?.reduce(
      (sum, p) => sum + (p.value[0]?.intVal ?? 0),
      0
    ) ?? 0;
    return {
      date: DateTime.fromMillis(Number(bucket.startTimeMillis)).toISODate() ?? dateISO,
      steps,
    };
  });
}

// ---------------------------------------------------------------------------
// Shared connect / callback / sync builder
// ---------------------------------------------------------------------------

function mountProviderRoutes(provider: ProviderConfig) {
  const base = `/${provider.id.replace("_", "-")}`;

  /** GET /api/integrations/{provider}/connect */
  router.get(`${base}/connect`, authRequired, (req: AuthenticatedRequest, res) => {
    if (!isAvailable(provider)) {
      res.status(503).json({ error: `${provider.name} integration is not configured on this server.` });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const challengeId = (req.query as { challengeId?: string }).challengeId ?? "";
    const state = Buffer.from(JSON.stringify({ userId: req.user!.id, challengeId })).toString(
      "base64url"
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: provider.clientId!,
      redirect_uri: callbackUrl(provider),
      scope: provider.scopes.join(provider.id === "fitbit" ? " " : " "),
      state,
      access_type: "offline", // Google requires this for refresh tokens
    });

    res.redirect(`${provider.authUrl}?${params.toString()}`);
  });

  /** GET /api/integrations/{provider}/callback */
  router.get(`${base}/callback`, async (req, res) => {
    if (!isAvailable(provider)) {
      res.status(503).json({ error: `${provider.name} integration is not configured.` });
      return;
    }

    const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;

    if (oauthError) {
      res.redirect(`${config.appOrigin}/?oauth_error=${encodeURIComponent(oauthError)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    let parsedState: { userId: string; challengeId: string };
    try {
      parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
        userId: string;
        challengeId: string;
      };
    } catch {
      res.status(400).json({ error: "Invalid state parameter" });
      return;
    }

    try {
      const tokens = await exchangeCode(provider, code);
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await prisma.oAuthConnection.upsert({
        where: { userId_provider: { userId: parsedState.userId, provider: provider.id } },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          providerUserId: tokens.user_id ?? null,
          scopes: provider.scopes.join(" "),
        },
        create: {
          userId: parsedState.userId,
          provider: provider.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          providerUserId: tokens.user_id ?? null,
          scopes: provider.scopes.join(" "),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: `oauth_connect_${provider.id}`,
          actorId: parsedState.userId,
          challengeId: parsedState.challengeId || null,
        },
      });

      // Redirect back to the SPA with a success signal
      const redirectUrl = parsedState.challengeId
        ? `${config.appOrigin}/?oauth_success=${provider.id}`
        : `${config.appOrigin}/?oauth_success=${provider.id}`;
      res.redirect(redirectUrl);
    } catch (err) {
      logger.error({ err, provider: provider.id }, "OAuth callback error");
      res.redirect(`${config.appOrigin}/?oauth_error=token_exchange_failed`);
    }
  });

  /** POST /api/integrations/{provider}/sync — fetch steps and upsert */
  const syncBodySchema = z.object({
    challengeId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be YYYY-MM-DD").optional(),
  });

  router.post(`${base}/sync`, authRequired, integrationSyncLimiter, async (req: AuthenticatedRequest, res) => {
    if (!isAvailable(provider)) {
      res.status(503).json({ error: `${provider.name} integration is not configured on this server.` });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parsed = syncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { challengeId } = parsed.data;

    const connection = await prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId: req.user!.id, provider: provider.id } },
    });
    if (!connection) {
      res.status(403).json({
        error: `${provider.name} is not connected. Visit /api/integrations/${provider.id.replace("_", "-")}/connect first.`,
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
      where: { userId_challengeId: { userId: req.user!.id, challengeId } },
    });
    if (!membership) {
      res.status(403).json({ error: "Not enrolled in this challenge" });
      return;
    }

    const tz = challenge.timezone;
    const dateISO = parsed.data.date ?? DateTime.now().setZone(tz).toISODate() ?? "";
    let accessToken: string;
    try {
      accessToken = await ensureFreshToken(connection, provider);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
      return;
    }

    let dayRows: DaySteps[];
    try {
      if (provider.id === "fitbit") {
        dayRows = await fetchFitbitSteps(accessToken, dateISO);
      } else {
        dayRows = await fetchGoogleFitSteps(accessToken, dateISO);
      }
    } catch (err) {
      logger.warn({ err, provider: provider.id }, "Step fetch failed");
      res.status(502).json({ error: `Failed to fetch steps from ${provider.name}: ${(err as Error).message}` });
      return;
    }

    const challengeStart = toDateOnly(
      DateTime.fromJSDate(challenge.startDate, { zone: tz }).toISODate() ?? "",
      tz
    );
    const challengeEnd = toDateOnly(
      DateTime.fromJSDate(challenge.endDate, { zone: tz }).toISODate() ?? "",
      tz
    );

    const prepared: Array<{ date: Date; steps: number }> = [];
    for (const row of dayRows) {
      const day = toDateOnly(row.date, tz);
      if (day < challengeStart || day > challengeEnd) continue; // silently skip out-of-window
      prepared.push({ date: toJsDate(day), steps: row.steps });
    }

    if (prepared.length === 0) {
      res.json({ imported: 0, updated: 0, skipped: dayRows.length });
      return;
    }

    const existing = await prisma.stepSubmission.findMany({
      where: {
        userId: req.user!.id,
        challengeId,
        date: { in: prepared.map((r) => r.date) },
      },
      select: { date: true },
    });
    const existingKeys = new Set(existing.map((s) => s.date.getTime()));

    await prisma.$transaction(
      prepared.map((row) =>
        prisma.stepSubmission.upsert({
          where: { userId_challengeId_date: { userId: req.user!.id, challengeId, date: row.date } },
          update: { steps: row.steps, isFlagged: row.steps > 100_000 },
          create: {
            userId: req.user!.id,
            challengeId,
            date: row.date,
            steps: row.steps,
            isFlagged: row.steps > 100_000,
          },
        })
      )
    );

    const updated = prepared.filter((r) => existingKeys.has(r.date.getTime())).length;
    const imported = prepared.length - updated;
    const skipped = dayRows.length - prepared.length;

    await prisma.auditLog.create({
      data: {
        action: `${provider.id}_sync`,
        actorId: req.user!.id,
        challengeId,
        metadata: { imported, updated, skipped },
      },
    });

    res.json({ imported, updated, skipped });
  });

  /** DELETE /api/integrations/{provider}/disconnect — revoke the OAuth connection */
  router.delete(`${base}/disconnect`, authRequired, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const deleted = await prisma.oAuthConnection.deleteMany({
      where: { userId: req.user!.id, provider: provider.id },
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: `${provider.name} is not connected.` });
      return;
    }

    await prisma.auditLog.create({
      data: { action: `oauth_disconnect_${provider.id}`, actorId: req.user!.id },
    });

    res.status(204).send();
  });
}

mountProviderRoutes(FITBIT);
mountProviderRoutes(GOOGLE_FIT);

// ---------------------------------------------------------------------------
// GET /api/integrations/connections — list all connected OAuth providers
// ---------------------------------------------------------------------------

router.get("/connections", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const connections = await prisma.oAuthConnection.findMany({
    where: { userId: req.user!.id },
    select: { provider: true, createdAt: true, updatedAt: true },
  });

  const providers = [FITBIT, GOOGLE_FIT].map((p) => {
    const conn = connections.find((c) => c.provider === p.id);
    return {
      id: p.id,
      name: p.name,
      available: isAvailable(p),
      connected: Boolean(conn),
      connectedAt: conn?.updatedAt?.toISOString() ?? null,
    };
  });

  res.json({ providers });
});

export default router;
