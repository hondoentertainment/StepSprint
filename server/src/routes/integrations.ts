import { Router } from "express";
import { z } from "zod";
import { FitnessProvider } from "@prisma/client";
import { authRequired, AuthenticatedRequest } from "../middleware/auth";
import { config } from "../config";
import { prisma } from "../prisma";
import { sealSecret } from "../utils/cryptoSecret";
import { fitbitConfigured, fitbitExchangeCode, fitbitFetchProfileUserId } from "../services/fitness/fitbitApi";
import { googleFitConfigured, googleExchangeCode } from "../services/fitness/googleFitApi";
import { fitnessProviderSlug, parseFitnessProviderSlug } from "../services/fitness/providers";
import { syncFitnessForUser } from "../services/fitness/syncService";

const router = Router();

const STATE_TTL_MIN = 15;

function callbackUrl(providerSlug: string): string {
  return `${config.apiPublicUrl}/api/integrations/fitness/oauth/${providerSlug}/callback`;
}

router.get("/fitness", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const connections = await prisma.fitnessConnection.findMany({
    where: { userId: req.user.id },
    select: { provider: true, updatedAt: true, externalUserId: true },
  });

  const connected = new Set(connections.map((c) => fitnessProviderSlug(c.provider)));

  res.json({
    connected: connections.length > 0,
    providers: [
      {
        id: "fitbit",
        name: "Fitbit",
        available: fitbitConfigured(),
        connectPath: "/api/integrations/fitness/oauth/fitbit/start",
        connected: connected.has("fitbit"),
      },
      {
        id: "google_fit",
        name: "Google Fit / Health",
        available: googleFitConfigured(),
        connectPath: "/api/integrations/fitness/oauth/google_fit/start",
        connected: connected.has("google_fit"),
        note: "Uses Google Fitness REST (activity read). Apple Health is not available on web.",
      },
    ],
    message:
      connections.length > 0
        ? "Fitness sync runs periodically; use “Sync now” on Submit to pull the latest steps."
        : "Connect a provider to import steps for the last 14 days. Manual entries are never overwritten.",
  });
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
