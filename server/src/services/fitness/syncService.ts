import { DateTime } from "luxon";
import { FitnessProvider, StepSubmissionSource } from "@prisma/client";
import { prisma } from "../../prisma";
import { openSecret, sealSecret } from "../../utils/cryptoSecret";
import { toDateOnly, toJsDate } from "../../utils/dates";
import { fitbitFetchStepsForDate, fitbitRefresh } from "./fitbitApi";
import { googleFetchDailySteps, googleRefresh } from "./googleFitApi";

async function persistTokens(
  id: string,
  access: string,
  refresh: string | null | undefined,
  expiresIn: number | undefined
): Promise<void> {
  const expiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000 - 60_000)
      : null;
  await prisma.fitnessConnection.update({
    where: { id },
    data: {
      accessTokenEnc: sealSecret(access),
      ...(refresh ? { refreshTokenEnc: sealSecret(refresh) } : {}),
      expiresAt,
    },
  });
}

async function refreshConnectionTokens(row: {
  id: string;
  provider: FitnessProvider;
  refreshTokenEnc: string | null;
  accessTokenEnc: string;
  expiresAt: Date | null;
}): Promise<string> {
  const access = openSecret(row.accessTokenEnc);
  const refresh = row.refreshTokenEnc ? openSecret(row.refreshTokenEnc) : null;
  const stale =
    !row.expiresAt || row.expiresAt.getTime() < Date.now() + 120_000;

  if (!stale) {
    return access;
  }

  if (!refresh) {
    return access;
  }

  if (row.provider === FitnessProvider.FITBIT) {
    const t = await fitbitRefresh(refresh);
    await persistTokens(row.id, t.access_token, t.refresh_token ?? refresh, t.expires_in);
    return t.access_token;
  }

  if (row.provider === FitnessProvider.GOOGLE_FIT) {
    const t = await googleRefresh(refresh);
    await persistTokens(row.id, t.access_token, t.refresh_token ?? refresh, t.expires_in);
    return t.access_token;
  }

  return access;
}

async function importStepsForDay(params: {
  userId: string;
  challengeId: string;
  challengeTimezone: string;
  dateIso: string;
  steps: number;
  locked: boolean;
}): Promise<boolean> {
  if (params.locked) return false;
  if (params.steps < 0) return false;

  const existing = await prisma.stepSubmission.findUnique({
    where: {
      userId_challengeId_date: {
        userId: params.userId,
        challengeId: params.challengeId,
        date: toJsDate(toDateOnly(params.dateIso, params.challengeTimezone)),
      },
    },
  });
  if (existing?.source === StepSubmissionSource.MANUAL) {
    return false;
  }

  const isFlagged = params.steps > 100_000;
  await prisma.stepSubmission.upsert({
    where: {
      userId_challengeId_date: {
        userId: params.userId,
        challengeId: params.challengeId,
        date: toJsDate(toDateOnly(params.dateIso, params.challengeTimezone)),
      },
    },
    update: { steps: params.steps, isFlagged, source: StepSubmissionSource.IMPORT },
    create: {
      userId: params.userId,
      challengeId: params.challengeId,
      date: toJsDate(toDateOnly(params.dateIso, params.challengeTimezone)),
      steps: params.steps,
      isFlagged,
      source: StepSubmissionSource.IMPORT,
    },
  });
  return true;
}

export async function cleanupExpiredOAuthStates(): Promise<void> {
  await prisma.fitnessOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

export async function syncFitnessForUser(userId: string): Promise<{ daysWritten: number }> {
  let daysWritten = 0;
  const googleRangeCache = new Map<string, Map<string, number>>();
  const connections = await prisma.fitnessConnection.findMany({ where: { userId } });
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: { challenge: true },
  });

  for (const conn of connections) {
    const access = await refreshConnectionTokens(conn);

    for (const m of memberships) {
      const ch = m.challenge;
      const tz = ch.timezone;
      const today = DateTime.now().setZone(tz).startOf("day");
      const chStart = DateTime.fromJSDate(ch.startDate, { zone: tz }).startOf("day");
      const chEnd = DateTime.fromJSDate(ch.endDate, { zone: tz }).startOf("day");
      let d = DateTime.max(chStart, today.minus({ days: 14 }));
      const end = DateTime.min(chEnd, today);

      if (conn.provider === FitnessProvider.FITBIT) {
        for (; d <= end; d = d.plus({ days: 1 })) {
          const dateIso = d.toISODate();
          if (!dateIso) continue;
          try {
            const steps = await fitbitFetchStepsForDate(access, dateIso);
            const ok = await importStepsForDay({
              userId,
              challengeId: ch.id,
              challengeTimezone: tz,
              dateIso,
              steps,
              locked: ch.locked,
            });
            if (ok) daysWritten += 1;
          } catch (err) {
            console.error(`Fitbit sync ${userId} ${dateIso}:`, err);
          }
        }
      } else if (conn.provider === FitnessProvider.GOOGLE_FIT) {
        const startR = DateTime.max(chStart, today.minus({ days: 14 }));
        const startMs = startR.startOf("day").toMillis();
        const endMs = end.endOf("day").toMillis();
        try {
          const cacheKey = `${startMs}|${endMs}`;
          let buckets = googleRangeCache.get(cacheKey);
          if (!buckets) {
            buckets = await googleFetchDailySteps(access, startMs, endMs);
            googleRangeCache.set(cacheKey, buckets);
          }
          for (const [startStr, steps] of buckets) {
            const startMillis = Number(startStr);
            if (!Number.isFinite(startMillis)) continue;
            const local = DateTime.fromMillis(startMillis, { zone: "utc" }).setZone(tz).startOf("day");
            const dateIso = local.toISODate();
            if (!dateIso) continue;
            if (local < chStart.startOf("day") || local > end) continue;
            const ok = await importStepsForDay({
              userId,
              challengeId: ch.id,
              challengeTimezone: tz,
              dateIso,
              steps,
              locked: ch.locked,
            });
            if (ok) daysWritten += 1;
          }
        } catch (err) {
          console.error(`Google Fit sync ${userId}:`, err);
        }
      }
    }
  }

  return { daysWritten };
}

export async function syncAllFitnessConnections(): Promise<void> {
  await cleanupExpiredOAuthStates();
  const rows = await prisma.fitnessConnection.findMany({ select: { userId: true } });
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    await syncFitnessForUser(r.userId).catch((err) => console.error("Fitness sync user failed:", r.userId, err));
  }
}
