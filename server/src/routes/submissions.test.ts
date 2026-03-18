import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";

describe("Submissions routes", () => {
  it("POST /api/submissions returns 401 without auth", async () => {
    const challenge = await prisma.challenge.findFirst();
    if (!challenge) return;
    await request(app)
      .post("/api/submissions")
      .send({
        challengeId: challenge.id,
        date: "2024-06-15",
        steps: 5000,
      })
      .expect(401);
  });

  it("POST /api/submissions returns 400 for invalid payload", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user1@stepsprint.local", password: "password123" });
    const cookie = loginRes.headers["set-cookie"];
    if (!cookie) return;

    await request(app)
      .post("/api/submissions")
      .set("Cookie", cookie)
      .send({})
      .expect(400);
  });
});
