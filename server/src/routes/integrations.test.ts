import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { DateTime } from "luxon";
import app from "../app";
import { prisma } from "../prisma";

/**
 * Integration tests for the CSV bulk import endpoint. Each `describe` block
 * owns its own challenge + users so we don't trample shared seed state and
 * so the tests can run in any order (vitest doesn't guarantee ordering
 * between files).
 */
describe("Integrations routes", () => {
  describe("POST /api/integrations/csv", () => {
    const suffix = crypto.randomBytes(4).toString("hex");
    const tz = "America/Chicago";
    // Pin dates inside a synthetic challenge window so tests don't depend on
    // the current wall clock.
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

      // Register two fresh users so we don't depend on shared seed passwords
      // changing in future iterations.
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

      // Only the "member" user is enrolled in either challenge.
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
      // Tear down everything this suite created so other test files (and
      // repeated local runs) see a clean slate.
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
});
