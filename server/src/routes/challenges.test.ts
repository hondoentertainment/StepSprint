import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("Challenges routes", () => {
  describe("GET /api/challenges", () => {
    it("returns challenges array", async () => {
      const res = await request(app).get("/api/challenges").expect(200);
      expect(res.body).toHaveProperty("challenges");
      expect(Array.isArray(res.body.challenges)).toBe(true);
    });
  });

  describe("GET /api/challenges/active", () => {
    it("returns challenge or null", async () => {
      const res = await request(app).get("/api/challenges/active").expect(200);
      expect(res.body).toHaveProperty("challenge");
    });
  });

  describe("GET /api/challenges/:id", () => {
    it("returns 404 for invalid id", async () => {
      await request(app).get("/api/challenges/invalid-id-12345").expect(404);
    });
  });
});
