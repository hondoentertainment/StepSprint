import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";

describe("Summary routes", () => {
  let userId: string;
  let challengeId: string;
  let cookie: string[];

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    const email = `summary-test-${suffix}@stepsprint.local`;
    const passwordHash = await bcrypt.hash("password123", 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, emailVerified: true },
    });
    userId = user.id;

    const challenge = await prisma.challenge.findFirst();
    if (!challenge) return;
    challengeId = challenge.id;

    await prisma.teamMember.upsert({
      where: { userId_challengeId: { userId, challengeId } },
      update: {},
      create: { userId, challengeId },
    });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    const raw = loginRes.headers["set-cookie"];
    cookie = Array.isArray(raw) ? raw : [raw];
  });

  afterAll(async () => {
    if (userId) {
      await prisma.teamMember.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  it("GET /api/me/summary returns 401 without auth", async () => {
    if (!challengeId) return;
    await request(app)
      .get(`/api/me/summary?challengeId=${challengeId}`)
      .expect(401);
  });

  it("GET /api/me/summary returns 400 without challengeId", async () => {
    if (!cookie) return;
    await request(app)
      .get("/api/me/summary")
      .set("Cookie", cookie)
      .expect(400);
  });

  it("GET /api/me/summary returns summary when enrolled", async () => {
    if (!cookie || !challengeId) return;
    const res = await request(app)
      .get(`/api/me/summary?challengeId=${challengeId}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toHaveProperty("personalTotals");
    expect(res.body.personalTotals).toHaveProperty("today");
    expect(res.body.personalTotals).toHaveProperty("week");
    expect(res.body.personalTotals).toHaveProperty("month");
    expect(res.body).toHaveProperty("teamTotals");
    expect(res.body).toHaveProperty("streak");
    expect(res.body).toHaveProperty("consistency");
  });
});
