import { describe, expect, it } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import app from "../app";
import { prisma } from "../prisma";
import { getIsoWeekRange } from "../utils/dates";

describe("Admin activity grid", () => {
  async function adminCookie(): Promise<string[]> {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@stepsprint.local", password: "password123" })
      .expect(200);
    const setCookie = loginRes.headers["set-cookie"];
    if (!setCookie) return [];
    return Array.isArray(setCookie) ? setCookie : [setCookie];
  }

  async function participantCookie(): Promise<string[]> {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user1@stepsprint.local", password: "password123" })
      .expect(200);
    const setCookie = loginRes.headers["set-cookie"];
    if (!setCookie) return [];
    return Array.isArray(setCookie) ? setCookie : [setCookie];
  }

  it("returns 403 for non-admin", async () => {
    const cookie = await participantCookie();
    await request(app)
      .get("/api/admin/challenges/demo-challenge/activity-grid?weekYear=2026&weekNumber=1")
      .set("Cookie", cookie)
      .expect(403);
  });

  it("returns 400 without week params", async () => {
    const cookie = await adminCookie();
    await request(app).get("/api/admin/challenges/demo-challenge/activity-grid").set("Cookie", cookie).expect(400);
  });

  it("returns 404 for unknown challenge", async () => {
    const cookie = await adminCookie();
    await request(app)
      .get("/api/admin/challenges/missing-id/activity-grid?weekYear=2026&weekNumber=1")
      .set("Cookie", cookie)
      .expect(404);
  });

  it("returns grid aligned with challenge participants for current ISO week", async () => {
    const challenge = await prisma.challenge.findUnique({ where: { id: "demo-challenge" } });
    expect(challenge).not.toBeNull();
    const ch = challenge!;
    const tz = ch.timezone;
    const now = DateTime.now().setZone(tz);
    const weekYear = now.weekYear;
    const weekNumber = now.weekNumber;
    const challengeStart = DateTime.fromJSDate(ch.startDate, { zone: tz }).startOf("day");
    const challengeEnd = DateTime.fromJSDate(ch.endDate, { zone: tz }).startOf("day");
    const { start: weekMonday } = getIsoWeekRange(weekYear, weekNumber, tz);
    const weekSunday = weekMonday.plus({ days: 6 }).startOf("day");
    const gridStart = weekMonday > challengeStart ? weekMonday : challengeStart;
    const gridEnd = weekSunday < challengeEnd ? weekSunday : challengeEnd;
    if (gridStart <= gridEnd) {
      const user1 = await prisma.user.findUnique({ where: { email: "user1@stepsprint.local" } });
      expect(user1).not.toBeNull();
      const day = gridStart.toJSDate();
      await prisma.stepSubmission.upsert({
        where: {
          userId_challengeId_date: {
            userId: user1!.id,
            challengeId: "demo-challenge",
            date: day,
          },
        },
        update: { steps: 9000, isFlagged: false },
        create: {
          userId: user1!.id,
          challengeId: "demo-challenge",
          date: day,
          steps: 9000,
          isFlagged: false,
        },
      });
    }

    const cookie = await adminCookie();
    const res = await request(app)
      .get(`/api/admin/challenges/demo-challenge/activity-grid?weekYear=${weekYear}&weekNumber=${weekNumber}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.challengeId).toBe("demo-challenge");
    expect(res.body).toHaveProperty("days");
    expect(res.body).toHaveProperty("rows");
    expect(res.body).toHaveProperty("timezone");
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThan(0);

    const row = res.body.rows.find((r: { email: string }) => r.email === "user1@stepsprint.local");
    expect(row).toBeDefined();

    if (gridStart > gridEnd) {
      expect(res.body.days.length).toBe(0);
      expect(row!.cells.length).toBe(0);
      return;
    }

    expect(row!.cells.length).toBe(res.body.days.length);
    const submitted = row!.cells.filter((c: { steps: number | null }) => c.steps !== null);
    expect(submitted.length).toBeGreaterThan(0);
  });
});
