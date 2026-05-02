/**
 * OAuth 2.0 flows for Fitbit, Google Fit, and Garmin Connect Developer Program (PKCE).
 *
 * Optional OAuth env vars disable that provider gracefully (503 on connect/sync + hidden in SPA).
 *
 * Garmin uses OAuth 2.0 Authorization Code **with PKCE** (stored server-side pending states).
 *
 * Callback URLs (`API_PUBLIC_ORIGIN` canonical):
 *   Fitbit:       /api/integrations/fitbit/callback
 *   Google Fit:   /api/integrations/google-fit/callback
 *   Garmin:       /api/integrations/garmin/callback
 */
import crypto from "crypto";
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

type DaySteps = { date: string; steps: number };

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  user_id?: string; // Fitbit
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

const GARMIN = {
  id: "garmin",
  name: "Garmin Connect",
  authUrl: "https://connect.garmin.com/oauth2Confirm",
  tokenUrl: "https://diauth.garmin.com/di-oauth2-service/oauth/token",
  dailiesUrl: "https://apis.garmin.com/wellness-api/rest/dailies",
};

const GARMIN_PKCE_TTL_MS = 15 * 60 * 1000;

function garminScopesList(): string[] {
  const raw = config.oauth.garminOAuthScope;
  if (!raw) return [];
  return raw.split(/\s+/u).map((s) => s.trim()).filter(Boolean);
}

function garminRedirectUri(): string {
  return `${config.apiPublicOrigin}/api/integrations/garmin/callback`;
}

function isGarminAvailable(): boolean {
  return Boolean(config.oauth.garminClientId && config.oauth.garminClientSecret);
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function deleteExpiredOAuthPkce(): Promise<void> {
  await prisma.oAuthPkcePending.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

async function garminExchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.oauth.garminClientId!,
    client_secret: config.oauth.garminClientSecret!,
    redirect_uri: garminRedirectUri(),
    code_verifier: codeVerifier,
  });
  const res = await fetch(GARMIN.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Garmin token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function garminRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.oauth.garminClientId!,
    client_secret: config.oauth.garminClientSecret!,
  });
  const res = await fetch(GARMIN.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Garmin token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function ensureFreshGarminToken(
  connection: { accessToken: string; refreshToken: string | null; expiresAt: Date | null; id: string }
): Promise<string> {
  const bufferMs = 5 * 60 * 1000;
  if (!connection.expiresAt || connection.expiresAt.getTime() - bufferMs > Date.now()) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) {
    throw new Error("Access token expired and no refresh token available. Please reconnect.");
  }
  const tokens = await garminRefreshToken(connection.refreshToken);
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
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

/** Pull daily summaries for calendar day interpreted in challenge `tz`. Wellness API payloads vary slightly by program; normalized here. */
async function fetchGarminSteps(accessToken: string, dateISO: string, tz: string): Promise<DaySteps[]> {
  const day = DateTime.fromISO(dateISO, { zone: tz });
  const startSec = Math.floor(day.startOf("day").toSeconds());
  const endSec = Math.floor(day.endOf("day").toSeconds());

  const qs = new URLSearchParams({
    uploadStartTimeInSeconds: String(startSec),
    uploadEndTimeInSeconds: String(endSec),
  });
  const res = await fetch(`${GARMIN.dailiesUrl}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Garmin wellness API (${res.status}): ${text.slice(0, 500)}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Garmin wellness API returned non-JSON.");
  }

  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    rows = body as Record<string, unknown>[];
  } else if (body && typeof body === "object" && Array.isArray((body as { dailies?: unknown }).dailies)) {
    rows = (body as { dailies: Record<string, unknown>[] }).dailies;
  } else if (body && typeof body === "object" && "calendarDate" in (body as object)) {
    rows = [body as Record<string, unknown>];
  }

  const out: DaySteps[] = [];
  for (const row of rows) {
    const dRaw = row.calendarDate ?? row.startTimeGMT ?? row.startTimeOffset;
    const stepsRaw = row.totalSteps ?? row.steps ?? row.stepsCount;
    if (typeof dRaw !== "string" || stepsRaw === undefined) continue;
    const datePart = dRaw.includes("T") ? dRaw.split("T")[0] ?? dRaw.slice(0, 10) : dRaw.slice(0, 10);
    let stepsNum = typeof stepsRaw === "number" ? stepsRaw : parseInt(String(stepsRaw), 10);
    if (Number.isNaN(stepsNum)) stepsNum = 0;
    out.push({ date: datePart, steps: Math.max(0, stepsNum) });
  }

  const matchISO = DateTime.fromISO(dateISO).toISODate();
  const sameDay = out.filter((x) => x.date === matchISO || x.date === dateISO.slice(0, 10));
  return sameDay.length > 0 ? sameDay : out;
}

function callbackUrl(provider: ProviderConfig): string {
  return `${config.apiPublicOrigin}/api/integrations/${provider.id.replace("_", "-")}/callback`;
}

/** Create an HMAC-signed, base64url-encoded OAuth state parameter. */
function createOAuthState(userId: string, challengeId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ userId, challengeId, nonce });
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

/** Verify and decode an OAuth state parameter. Returns null if invalid. */
function parseOAuthState(state: string): { userId: string; challengeId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      payload: string;
      sig: string;
    };
    const expected = crypto
      .createHmac("sha256", config.jwtSecret)
      .update(decoded.payload)
      .digest("hex");
    const sigBuf = Buffer.from(decoded.sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    return JSON.parse(decoded.payload) as { userId: string; challengeId: string };
  } catch {
    return null;
  }
}

function isAvailable(p: ProviderConfig) {
  return Boolean(p.clientId && p.clientSecret);
}

// ---------------------------------------------------------------------------
// Token exchange helpers
// ---------------------------------------------------------------------------

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
    const state = createOAuthState(req.user!.id, challengeId);

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
      res.redirect(`${config.appOrigin}/integrations?oauth_error=${encodeURIComponent(oauthError)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    const parsedState = parseOAuthState(state);
    if (!parsedState) {
      res.status(400).json({ error: "Invalid or tampered state parameter" });
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
        ? `${config.appOrigin}/integrations?oauth_success=${provider.id}`
        : `${config.appOrigin}/integrations?oauth_success=${provider.id}`;
      res.redirect(redirectUrl);
    } catch (err) {
      logger.error({ err, provider: provider.id }, "OAuth callback error");
      res.redirect(`${config.appOrigin}/integrations?oauth_error=token_exchange_failed`);
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

/** Garmin Connect OAuth 2 PKCE flows (distinct from Fitbit/Google — verifier stored pending callback). */
function mountGarminRoutes(): void {
  const base = "/garmin";

  router.get(`${base}/connect`, authRequired, async (req: AuthenticatedRequest, res) => {
    if (!isGarminAvailable()) {
      res.status(503).json({
        error: "Garmin Connect integration is not configured on this server.",
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const challengeId = (req.query as { challengeId?: string }).challengeId ?? "";
    await deleteExpiredOAuthPkce();
    const { verifier, challenge } = generatePkcePair();
    const stateNonce = base64Url(crypto.randomBytes(24));

    await prisma.oAuthPkcePending.create({
      data: {
        stateNonce,
        codeVerifier: verifier,
        userId: req.user.id,
        challengeId: challengeId || null,
        expiresAt: new Date(Date.now() + GARMIN_PKCE_TTL_MS),
      },
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.oauth.garminClientId!,
      redirect_uri: garminRedirectUri(),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: stateNonce,
    });

    const scoped = garminScopesList();
    if (scoped.length > 0) params.set("scope", scoped.join(" "));

    res.redirect(`${GARMIN.authUrl}?${params}`);
  });

  router.get(`${base}/callback`, async (req, res) => {
    if (!isGarminAvailable()) {
      res.status(503).json({ error: "Garmin Connect integration is not configured." });
      return;
    }

    const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;

    if (oauthError) {
      res.redirect(`${config.appOrigin}/integrations?oauth_error=${encodeURIComponent(oauthError)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    const pending = await prisma.oAuthPkcePending.findUnique({
      where: { stateNonce: state },
    });

    if (!pending || pending.expiresAt < new Date()) {
      if (pending) {
        await prisma.oAuthPkcePending.delete({ where: { id: pending.id } }).catch(() => {});
      }
      res.redirect(`${config.appOrigin}/integrations?oauth_error=oauth_state_invalid`);
      return;
    }

    await prisma.oAuthPkcePending.delete({ where: { id: pending.id } });

    try {
      const tokens = await garminExchangeCode(code, pending.codeVerifier);
      const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
      const scopeStr = garminScopesList().join(" ");

      await prisma.oAuthConnection.upsert({
        where: {
          userId_provider: {
            userId: pending.userId,
            provider: GARMIN.id,
          },
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          providerUserId: tokens.user_id ?? null,
          scopes: scopeStr.length > 0 ? scopeStr : null,
        },
        create: {
          userId: pending.userId,
          provider: GARMIN.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          providerUserId: tokens.user_id ?? null,
          scopes: scopeStr.length > 0 ? scopeStr : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "oauth_connect_garmin",
          actorId: pending.userId,
          challengeId: pending.challengeId || null,
        },
      });

      res.redirect(`${config.appOrigin}/integrations?oauth_success=garmin`);
    } catch (err) {
      logger.error({ err }, "Garmin OAuth callback error");
      res.redirect(`${config.appOrigin}/integrations?oauth_error=token_exchange_failed`);
    }
  });

  const garminSyncBodySchema = z.object({
    challengeId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  });

  router.post(`${base}/sync`, authRequired, integrationSyncLimiter, async (req: AuthenticatedRequest, res) => {
    if (!isGarminAvailable()) {
      res.status(503).json({
        error: "Garmin Connect integration is not configured on this server.",
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const user = req.user;

    const parsed = garminSyncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { challengeId } = parsed.data;
    const connection = await prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: GARMIN.id } },
    });

    if (!connection) {
      res.status(403).json({
        error: `${GARMIN.name} is not connected. Visit /api/integrations/garmin/connect first.`,
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
      where: { userId_challengeId: { userId: user.id, challengeId } },
    });
    if (!membership) {
      res.status(403).json({ error: "Not enrolled in this challenge" });
      return;
    }

    const tz = challenge.timezone;
    const dateISO =
      parsed.data.date ?? DateTime.now().setZone(tz).toISODate() ?? "";

    let accessToken: string;
    try {
      accessToken = await ensureFreshGarminToken(connection);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
      return;
    }

    let dayRows: DaySteps[];
    try {
      dayRows = await fetchGarminSteps(accessToken, dateISO, tz);
    } catch (err) {
      logger.warn({ err }, "Garmin step fetch failed");
      res.status(502).json({
        error: `Failed to fetch steps from ${GARMIN.name}: ${(err as Error).message}`,
      });
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
      if (day < challengeStart || day > challengeEnd) continue;
      prepared.push({ date: toJsDate(day), steps: row.steps });
    }

    if (prepared.length === 0) {
      res.json({ imported: 0, updated: 0, skipped: dayRows.length });
      return;
    }

    const existing = await prisma.stepSubmission.findMany({
      where: {
        userId: user.id,
        challengeId,
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
              userId: user.id,
              challengeId,
              date: row.date,
            },
          },
          update: {
            steps: row.steps,
            isFlagged: row.steps > 100_000,
          },
          create: {
            userId: user.id,
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
        action: "garmin_sync",
        actorId: user.id,
        challengeId,
        metadata: { imported, updated, skipped },
      },
    });

    res.json({ imported, updated, skipped });
  });

  router.delete(`${base}/disconnect`, authRequired, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const deleted = await prisma.oAuthConnection.deleteMany({
      where: { userId: req.user.id, provider: GARMIN.id },
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: `${GARMIN.name} is not connected.` });
      return;
    }

    await prisma.auditLog.create({
      data: { action: "oauth_disconnect_garmin", actorId: req.user.id },
    });

    res.status(204).send();
  });
}

mountGarminRoutes();
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

  const providers = [
    { id: FITBIT.id, name: FITBIT.name, available: isAvailable(FITBIT) },
    { id: GOOGLE_FIT.id, name: GOOGLE_FIT.name, available: isAvailable(GOOGLE_FIT) },
    { id: GARMIN.id, name: GARMIN.name, available: isGarminAvailable() },
  ].map((p) => {
    const conn = connections.find((c) => c.provider === p.id);
    return {
      id: p.id,
      name: p.name,
      available: p.available,
      connected: Boolean(conn),
      connectedAt: conn?.updatedAt?.toISOString() ?? null,
    };
  });

  res.json({ providers });
});

export default router;
