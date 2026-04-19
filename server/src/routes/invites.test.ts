import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";
import { INVITE_CODE_TTL_MS } from "./invites";

describe("Invites routes", () => {
  const suffix = crypto.randomBytes(4).toString("hex");
  const validCode = `invite-valid-${suffix}`;
  const expiredCode = `invite-expired-${suffix}`;
  let validChallengeId: string;
  let expiredChallengeId: string;

  beforeAll(async () => {
    const now = new Date();
    const validChallenge = await prisma.challenge.create({
      data: {
        name: `Invite Happy ${suffix}`,
        startDate: now,
        endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        timezone: "America/Chicago",
        teamSize: 4,
        inviteCode: validCode,
        inviteCodeExpiresAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
      },
    });
    validChallengeId = validChallenge.id;

    const expiredChallenge = await prisma.challenge.create({
      data: {
        name: `Invite Expired ${suffix}`,
        startDate: now,
        endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        timezone: "America/Chicago",
        teamSize: 4,
        inviteCode: expiredCode,
        // Already expired: one second in the past.
        inviteCodeExpiresAt: new Date(Date.now() - 1000),
      },
    });
    expiredChallengeId = expiredChallenge.id;
  });

  afterAll(async () => {
    // Tests above never create members on these test challenges, so a direct
    // delete is safe.
    await prisma.challenge.deleteMany({
      where: { id: { in: [validChallengeId, expiredChallengeId] } },
    });
  });

  describe("GET /api/invites/:code", () => {
    it("returns challenge info for a valid, non-expired code (happy path)", async () => {
      const res = await request(app).get(`/api/invites/${validCode}`).expect(200);
      expect(res.body.challengeId).toBe(validChallengeId);
      expect(res.body.challengeName).toContain("Invite Happy");
      expect(res.body).toHaveProperty("expiresAt");
    });

    it("returns 410 Gone for an expired code", async () => {
      const res = await request(app).get(`/api/invites/${expiredCode}`).expect(410);
      expect(res.body.error).toMatch(/expired/i);
    });

    it("returns 404 for an unknown code", async () => {
      await request(app).get("/api/invites/does-not-exist").expect(404);
    });
  });
});
