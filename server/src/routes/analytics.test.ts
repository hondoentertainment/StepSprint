import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";

describe("Admin analytics", () => {
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
    await request(app).get("/api/admin/analytics?challengeId=demo-challenge").set("Cookie", cookie).expect(403);
  });

  it("returns challenge analytics for admin", async () => {
    const cookie = await adminCookie();
    const res = await request(app)
      .get("/api/admin/analytics?challengeId=demo-challenge")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.challengeId).toBe("demo-challenge");
    expect(res.body).toHaveProperty("participantCount");
    expect(res.body).toHaveProperty("participationRate");
    expect(res.body).toHaveProperty("neverLoggedCount");
    expect(res.body).toHaveProperty("dormantParticipantCount");
    expect(res.body).toHaveProperty("submissionTrend");
    expect(Array.isArray(res.body.submissionTrend)).toBe(true);
  });

