import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("Auth routes", () => {
  describe("POST /api/auth/login", () => {
    it("returns 400 for invalid payload", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({})
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 for invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "not-an-email" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    it("creates or updates user and returns token", async () => {
      const email = `test-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, name: "Test User" })
        .expect(200);
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.name).toBe("Test User");
      expect(res.body.user).toHaveProperty("id");
      expect(res.body.user).toHaveProperty("role");
      expect(res.body).toHaveProperty("token");
      expect(res.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without auth", async () => {
      await request(app).get("/api/auth/me").expect(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears cookie and returns ok", async () => {
      const res = await request(app).post("/api/auth/logout").expect(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
