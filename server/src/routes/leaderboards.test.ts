import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";

describe("Leaderboards routes", () => {
  describe("GET /api/leaderboards/weekly", () => {
    it("returns 400 without challengeId", async () => {
      await request(app)
        .get("/api/leaderboards/weekly")
        .expect(400);
    });

    it("returns leaderboard with weekYear and weekNumber", async () => {
      const challenge = await prisma.challenge.findFirst();
      if (!challenge) return;
      const res = await request(app)
        .get(`/api/leaderboards/weekly?challengeId=${challenge.id}`)
        .expect(200);
      expect(res.body).toHaveProperty("leaderboard");
      expect(res.body).toHaveProperty("weekYear");
      expect(res.body).toHaveProperty("weekNumber");
      expect(Array.isArray(res.body.leaderboard)).toBe(true);
    });
  });

  describe("GET /api/leaderboards/teams", () => {
    it("returns 400 without challengeId", async () => {
      await request(app)
        .get("/api/leaderboards/teams")
        .expect(400);
    });

    it("returns team leaderboard", async () => {
      const challenge = await prisma.challenge.findFirst();
      if (!challenge) return;
      const res = await request(app)
        .get(`/api/leaderboards/teams?challengeId=${challenge.id}`)
        .expect(200);
      expect(res.body).toHaveProperty("leaderboard");
      expect(Array.isArray(res.body.leaderboard)).toBe(true);
    });
  });
});
