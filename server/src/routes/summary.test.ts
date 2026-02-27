import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";

describe("Summary routes", () => {
  it("GET /api/me/summary returns 401 without auth", async () => {
    const challenge = await prisma.challenge.findFirst();
    if (!challenge) return;
    await request(app)
      .get(`/api/me/summary?challengeId=${challenge.id}`)
      .expect(401);
  });

  it("GET /api/me/summary returns 400 without challengeId", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user1@stepsprint.local" });
    const cookie = loginRes.headers["set-cookie"];
    if (!cookie) return;

    await request(app)
      .get("/api/me/summary")
      .set("Cookie", cookie)
      .expect(400);
  });

  it("GET /api/me/summary returns summary when enrolled", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user1@stepsprint.local" });
    const cookie = loginRes.headers["set-cookie"];
    const challenge = await prisma.challenge.findFirst();
    if (!cookie || !challenge) return;

    const res = await request(app)
      .get(`/api/me/summary?challengeId=${challenge.id}`)
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
