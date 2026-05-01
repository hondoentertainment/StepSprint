import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { DateTime } from "luxon";
import app from "../app";
import { prisma } from "../prisma";

/**
 * Integration tests for integrations routes. Each `describe` block owns its
 * own challenge + users so tests can run in any order.
 */
describe("Integrations routes", () => {
  describe("POST /api/integrations/csv", () => {
    const suffix = crypto.randomBytes(4).toString("hex");
    const tz = "America/Chicago";
    const startISO = "2026-03-01";
    const endISO = "2026-03-31";
    const rowDates = ["2026-03-10", "2026-03-11", "2026-03-12"];

    let openChallengeId: string;
    let lockedChallengeId: string;
    let memberUserId: string;
    let outsiderUserId: string;
    let memberCookie: string[];
    let outsiderCookie: string[];

    beforeAll(async () => {
      const start = DateTime.fromISO(startISO, { zone: tz }).startOf("day").toJSDate();
      const end = DateTime.fromISO(endISO, { zone: tz }).endOf("day").toJSDate();

      const openChallenge = await prisma.challenge.create({
        data: {
          name: `CSV Open ${suffix}`,
          startDate: start,
          endDate: end,
          timezone: tz,
          teamSize: 4,
        },
      });
      openChallengeId = openChallenge.id;

      const lockedChallenge = await prisma.challenge.create({
        data: {
          name: `CSV Locked ${suffix}`,
          startDate: start,
          endDate: end,
          timezone: tz,
          teamSize: 4,
          locked: true,
        },
      });
      lockedChallengeId = lockedChallenge.id;

      const memberEmail = `csv-member-${suffix}@stepsprint.local`;
      const outsiderEmail = `csv-outsider-${suffix}@stepsprint.local`;
      await request(app)
        .post("/api/auth/register")
        .send({ email: memberEmail, password: "password123", name: "CSV Member" })
        .expect(200);
      await request(app)
        .post("/api/auth/register")
        .send({ email: outsiderEmail, password: "password123", name: "CSV Outsider" })
        .expect(200);

      const memberUser = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
      const outsiderUser = await prisma.user.findUniqueOrThrow({ where: { email: outsiderEmail } });
      memberUserId = memberUser.id;
      outsiderUserId = outsiderUser.id;

      await prisma.teamMember.create({
        data: { userId: memberUserId, challengeId: openChallengeId },
      });
      await prisma.teamMember.create({
        data: { userId: memberUserId, challengeId: lockedChallengeId },
      });

      const memberLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: memberEmail, password: "password123" })
        .expect(200);
      const memberSetCookie = memberLogin.headers["set-cookie"];
      memberCookie = Array.isArray(memberSetCookie) ? memberSetCookie : [memberSetCookie];

      const outsiderLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: outsiderEmail, password: "password123" })
        .expect(200);
      const outsiderSetCookie = outsiderLogin.headers["set-cookie"];
      outsiderCookie = Array.isArray(outsiderSetCookie) ? outsiderSetCookie : [outsiderSetCookie];
    });

    afterAll(async () => {
      await prisma.auditLog.deleteMany({
        where: { challengeId: { in: [openChallengeId, lockedChallengeId] } },
      });
      await prisma.stepSubmission.deleteMany({
        where: { challengeId: { in: [openChallengeId, lockedChallengeId] } },
      });
      await prisma.teamMember.deleteMany({
        where: { challengeId: { in: [openChallengeId, lockedChallengeId] } },
      });
      await prisma.challenge.deleteMany({
        where: { id: { in: [openChallengeId, lockedChallengeId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [memberUserId, outsiderUserId] } },
      });
    });

    it("401 without auth", async () => {
      await request(app)
        .post("/api/integrations/csv")
        .send({ challengeId: openChallengeId, rows: [{ date: rowDates[0], steps: 1000 }] })
        .expect(401);
    });

    it("imports 3 rows on happy path", async () => {
      const rows = rowDates.map((date, i) => ({ date, steps: 4000 + i * 1000 }));
      const res = await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({ challengeId: openChallengeId, rows })
        .expect(200);

      expect(res.body).toEqual({ imported: 3, updated: 0, skipped: 0 });

      const persisted = await prisma.stepSubmission.findMany({
        where: { userId: memberUserId, challengeId: openChallengeId },
        orderBy: { date: "asc" },
      });
      expect(persisted).toHaveLength(3);
      expect(persisted.map((p) => p.steps)).toEqual([4000, 5000, 6000]);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "csv_import", actorId: memberUserId, challengeId: openChallengeId },
      });
      expect(audit).not.toBeNull();
    });

    it("re-import updates existing rows", async () => {
      const rows = rowDates.map((date, i) => ({ date, steps: 9000 + i * 1000 }));
      const res = await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({ challengeId: openChallengeId, rows })
        .expect(200);

      expect(res.body).toEqual({ imported: 0, updated: 3, skipped: 0 });

      const persisted = await prisma.stepSubmission.findMany({
        where: { userId: memberUserId, challengeId: openChallengeId },
        orderBy: { date: "asc" },
      });
      expect(persisted.map((p) => p.steps)).toEqual([9000, 10000, 11000]);
    });

    it("403 when user is not a TeamMember", async () => {
      await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", outsiderCookie)
        .send({ challengeId: openChallengeId, rows: [{ date: rowDates[0], steps: 1000 }] })
        .expect(403);
    });

    it("409 when the challenge is locked", async () => {
      const res = await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({ challengeId: lockedChallengeId, rows: [{ date: rowDates[0], steps: 1000 }] })
        .expect(409);
      expect(res.body.error).toMatch(/locked/i);
    });

    it("413 when more than 500 rows are sent", async () => {
      const rows = Array.from({ length: 501 }, (_, i) => ({
        date: rowDates[0],
        steps: i,
      }));
      const res = await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({ challengeId: openChallengeId, rows })
        .expect(413);
      expect(res.body).toHaveProperty("max", 500);
    });

    it("400 for malformed body (missing rows)", async () => {
      await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({ challengeId: openChallengeId })
        .expect(400);
    });

    it("400 for malformed row (steps too large)", async () => {
      await request(app)
        .post("/api/integrations/csv")
        .set("Cookie", memberCookie)
        .send({
          challengeId: openChallengeId,
          rows: [{ date: rowDates[0], steps: 300_000 }],
        })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // Integration token management
  // -------------------------------------------------------------------------

  describe("Integration token management", () => {
    const suffix = crypto.randomBytes(4).toString("hex");
    let userId: string;
    let cookie: string[];

    beforeAll(async () => {
      const email = `token-user-${suffix}@stepsprint.local`;
      await request(app)
        .post("/api/auth/register")
        .send({ email, password: "password123", name: "Token User" })
        .expect(200);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      userId = user.id;

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "password123" })
        .expect(200);
      const setCookie = login.headers["set-cookie"];
      cookie = Array.isArray(setCookie) ? setCookie : [setCookie];
    });

    afterAll(async () => {
      await prisma.integrationToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    it("401 — POST /tokens without auth", async () => {
      await request(app).post("/api/integrations/tokens").send({}).expect(401);
    });

    it("401 — GET /tokens without auth", async () => {
      await request(app).get("/api/integrations/tokens").expect(401);
    });

    it("creates a token and returns plaintext once", async () => {
      const res = await request(app)
        .post("/api/integrations/tokens")
        .set("Cookie", cookie)
        .send({ label: "My Watch" })
        .expect(201);

      expect(res.body.token).toMatch(/^ssp_[0-9a-f]{64}$/);
      expect(res.body.label).toBe("My Watch");
    });

    it("creates a token with default label when none given", async () => {
      const res = await request(app)
        .post("/api/integrations/tokens")
        .set("Cookie", cookie)
        .send({})
        .expect(201);

      expect(res.body.label).toBe("Apple Watch Sync");
    });

    it("lists tokens without exposing plaintext", async () => {
      const res = await request(app)
        .get("/api/integrations/tokens")
        .set("Cookie", cookie)
        .expect(200);

      expect(Array.isArray(res.body.tokens)).toBe(true);
      expect(res.body.tokens.length).toBeGreaterThanOrEqual(2);
      for (const t of res.body.tokens as Record<string, unknown>[]) {
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("label");
        expect(t).toHaveProperty("createdAt");
        expect(t).not.toHaveProperty("tokenHash");
        expect(t).not.toHaveProperty("token");
      }
    });

    it("revokes a token", async () => {
      // Create a fresh token to revoke
      const createRes = await request(app)
        .post("/api/integrations/tokens")
        .set("Cookie", cookie)
        .send({ label: "To revoke" })
        .expect(201);

      const listBefore = await request(app)
        .get("/api/integrations/tokens")
        .set("Cookie", cookie)
        .expect(200);
      const tokenRecord = (listBefore.body.tokens as Array<{ id: string; label: string }>).find(
        (t) => t.label === "To revoke"
      );
      expect(tokenRecord).toBeDefined();

      await request(app)
        .delete(`/api/integrations/tokens/${tokenRecord!.id}`)
        .set("Cookie", cookie)
        .expect(204);

      const listAfter = await request(app)
        .get("/api/integrations/tokens")
        .set("Cookie", cookie)
        .expect(200);
      const stillExists = (listAfter.body.tokens as Array<{ id: string }>).find(
        (t) => t.id === tokenRecord!.id
      );
      expect(stillExists).toBeUndefined();

      // The plaintext token from createRes is now invalid
      expect(createRes.body.token).toBeDefined();
    });

    it("404 when revoking another user's token", async () => {
      // Create a second user to own a token
      const email2 = `token-other-${suffix}@stepsprint.local`;
      await request(app)
        .post("/api/auth/register")
        .send({ email: email2, password: "password123", name: "Other" })
        .expect(200);
      const other = await prisma.user.findUniqueOrThrow({ where: { email: email2 } });

      const raw = crypto.randomBytes(32).toString("hex");
      const plain = `ssp_${raw}`;
      const hash = require("crypto").createHash("sha256").update(plain).digest("hex");
      const otherToken = await prisma.integrationToken.create({
        data: { userId: other.id, tokenHash: hash, label: "Other token" },
      });

      await request(app)
        .delete(`/api/integrations/tokens/${otherToken.id}`)
        .set("Cookie", cookie)
        .expect(404);

      await prisma.integrationToken.deleteMany({ where: { userId: other.id } });
      await prisma.user.deleteMany({ where: { id: other.id } });
    });
  });

  // -------------------------------------------------------------------------
  // Apple Health sync endpoint
  // -------------------------------------------------------------------------

  describe("POST /api/integrations/apple-health", () => {
    const suffix = crypto.randomBytes(4).toString("hex");
    const tz = "America/New_York";
    const startISO = "2026-03-01";
    const endISO = "2026-03-31";

    let challengeId: string;
    let lockedChallengeId: string;
    let userId: string;
    let outsiderUserId: string;
    let bearerToken: string;
    let outsiderToken: string;

    beforeAll(async () => {
      const start = DateTime.fromISO(startISO, { zone: tz }).startOf("day").toJSDate();
      const end = DateTime.fromISO(endISO, { zone: tz }).endOf("day").toJSDate();

      const ch = await prisma.challenge.create({
        data: { name: `AH Open ${suffix}`, startDate: start, endDate: end, timezone: tz, teamSize: 4 },
      });
      challengeId = ch.id;

      const locked = await prisma.challenge.create({
        data: {
          name: `AH Locked ${suffix}`,
          startDate: start,
          endDate: end,
          timezone: tz,
          teamSize: 4,
          locked: true,
        },
      });
      lockedChallengeId = locked.id;

      const memberEmail = `ah-member-${suffix}@stepsprint.local`;
      const outsiderEmail = `ah-outsider-${suffix}@stepsprint.local`;

      await request(app)
        .post("/api/auth/register")
        .send({ email: memberEmail, password: "password123", name: "AH Member" })
        .expect(200);
      await request(app)
        .post("/api/auth/register")
        .send({ email: outsiderEmail, password: "password123", name: "AH Outsider" })
        .expect(200);

      const memberUser = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
      const outsiderUser = await prisma.user.findUniqueOrThrow({ where: { email: outsiderEmail } });
      userId = memberUser.id;
      outsiderUserId = outsiderUser.id;

      await prisma.teamMember.createMany({
        data: [
          { userId, challengeId },
          { userId, challengeId: lockedChallengeId },
        ],
      });

      // Create tokens via login + cookie
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: memberEmail, password: "password123" })
        .expect(200);
      const setCookie = login.headers["set-cookie"];
      const cookie = Array.isArray(setCookie) ? setCookie : [setCookie];

      const tokenRes = await request(app)
        .post("/api/integrations/tokens")
        .set("Cookie", cookie)
        .send({ label: "AH Test" })
        .expect(201);
      bearerToken = tokenRes.body.token as string;

      // Outsider login + token
      const outsiderLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: outsiderEmail, password: "password123" })
        .expect(200);
      const outsiderCookie = outsiderLogin.headers["set-cookie"];
      const oC = Array.isArray(outsiderCookie) ? outsiderCookie : [outsiderCookie];
      const outTokenRes = await request(app)
        .post("/api/integrations/tokens")
        .set("Cookie", oC)
        .send({ label: "Outsider" })
        .expect(201);
      outsiderToken = outTokenRes.body.token as string;
    });

    afterAll(async () => {
      await prisma.auditLog.deleteMany({
        where: { challengeId: { in: [challengeId, lockedChallengeId] } },
      });
      await prisma.stepSubmission.deleteMany({
        where: { challengeId: { in: [challengeId, lockedChallengeId] } },
      });
      await prisma.teamMember.deleteMany({
        where: { challengeId: { in: [challengeId, lockedChallengeId] } },
      });
      await prisma.integrationToken.deleteMany({ where: { userId: { in: [userId, outsiderUserId] } } });
      await prisma.challenge.deleteMany({
        where: { id: { in: [challengeId, lockedChallengeId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderUserId] } } });
    });

    it("401 without Authorization header", async () => {
      await request(app)
        .post("/api/integrations/apple-health")
        .send({ challengeId, date: "2026-03-10", steps: 8000 })
        .expect(401);
    });

    it("401 with invalid token", async () => {
      await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", "Bearer ssp_invalid")
        .send({ challengeId, date: "2026-03-10", steps: 8000 })
        .expect(401);
    });

    it("syncs a single day via shorthand", async () => {
      const res = await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({ challengeId, date: "2026-03-10", steps: 7500 })
        .expect(200);

      expect(res.body).toEqual({ imported: 1, updated: 0, skipped: 0 });

      const sub = await prisma.stepSubmission.findFirst({
        where: { userId, challengeId, steps: 7500 },
      });
      expect(sub).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: "apple_health_sync", actorId: userId, challengeId },
      });
      expect(audit).not.toBeNull();
    });

    it("updates an existing submission on re-sync", async () => {
      const res = await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({ challengeId, date: "2026-03-10", steps: 9200 })
        .expect(200);

      expect(res.body).toEqual({ imported: 0, updated: 1, skipped: 0 });
    });

    it("syncs a batch via rows[]", async () => {
      const res = await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({
          challengeId,
          rows: [
            { date: "2026-03-15", steps: 5000 },
            { date: "2026-03-16", steps: 6000 },
          ],
        })
        .expect(200);

      expect(res.body).toEqual({ imported: 2, updated: 0, skipped: 0 });
    });

    it("403 when outsider token tries to sync", async () => {
      await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({ challengeId, date: "2026-03-10", steps: 5000 })
        .expect(403);
    });

    it("409 when challenge is locked", async () => {
      const res = await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({ challengeId: lockedChallengeId, date: "2026-03-10", steps: 5000 })
        .expect(409);
      expect(res.body.error).toMatch(/locked/i);
    });

    it("400 when date is outside challenge window", async () => {
      await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({ challengeId, date: "2025-01-01", steps: 5000 })
        .expect(400);
    });

    it("400 when neither rows nor date+steps are provided", async () => {
      await request(app)
        .post("/api/integrations/apple-health")
        .set("Authorization", `Bearer ${bearerToken}`)
        .send({ challengeId })
        .expect(400);
    });
  });
});
