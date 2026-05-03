import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("Health", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("up");
    expect(res.body.service).toBe("stepsprint-api");
  });
});
