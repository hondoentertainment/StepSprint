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

    it("returns 400 for missing password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "user1@stepsprint.local" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 401 for wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "user1@stepsprint.local", password: "wrongpass1" })
        .expect(401);
      expect(res.body.error).toBe("Invalid email or password");
    });

    it("returns 401 for non-existent email", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "password123" })
        .expect(401);
      expect(res.body.error).toBe("Invalid email or password");
    });

    it("returns user and token for correct credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "user1@stepsprint.local", password: "password123" })
        .expect(200);
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe("user1@stepsprint.local");
      expect(res.body.user).toHaveProperty("id");
      expect(res.body.user).toHaveProperty("role");
      expect(res.body).toHaveProperty("token");
      expect(res.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("POST /api/auth/register", () => {
    it("returns 400 for weak password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "newuser@example.com", password: "short" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    it("creates new user with valid data", async () => {
      const email = `register-${Date.now()}@example.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email, password: "testpass123", name: "New User" })
        .expect(200);
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.name).toBe("New User");
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("returns 409 for existing email with password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "user1@stepsprint.local",
          password: "newpassword1",
        })
        .expect(409);
      expect(res.body.error).toContain("already exists");
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    it("returns ok for any email (no enumeration)", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@example.com" })
        .expect(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns ok for valid email", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "user1@stepsprint.local" })
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("returns 400 for invalid token", async () => {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: "invalidtoken",
          email: "user1@stepsprint.local",
          password: "newpassword1",
        })
        .expect(400);
      expect(res.body.error).toBe("Invalid or expired reset link");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without auth", async () => {
      await request(app).get("/api/auth/me").expect(401);
    });

    it("returns user when authenticated", async () => {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "user1@stepsprint.local", password: "password123" });
      const cookie = loginRes.headers["set-cookie"];

      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookie)
        .expect(200);
      expect(res.body.user.email).toBe("user1@stepsprint.local");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears cookie and returns ok", async () => {
      const res = await request(app).post("/api/auth/logout").expect(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
