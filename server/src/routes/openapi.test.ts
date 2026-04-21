import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("OpenAPI routes", () => {
  it("GET /api/openapi.json returns a valid OpenAPI 3.0 document", async () => {
    const res = await request(app).get("/api/openapi.json").expect(200);

    expect(res.body).toBeTypeOf("object");
    expect(res.body.openapi).toMatch(/^3\.0/);
    expect(res.body.info).toBeTypeOf("object");
    expect(res.body.info.title).toBe("StepSprint API");
    expect(res.body.paths).toBeTypeOf("object");

    // At minimum the auth + submissions routes should be registered.
    expect(res.body.paths["/api/auth/login"]).toBeDefined();
    expect(res.body.paths["/api/auth/login"].post).toBeDefined();
    expect(res.body.paths["/api/auth/register"]).toBeDefined();
    expect(res.body.paths["/api/auth/me"]).toBeDefined();
    expect(res.body.paths["/api/submissions"]).toBeDefined();
    expect(res.body.paths["/api/submissions"].post).toBeDefined();
    expect(res.body.paths["/api/submissions"].get).toBeDefined();

    // Expanded coverage: challenges, leaderboards, invites, summary.
    expect(res.body.paths["/api/challenges"]).toBeDefined();
    expect(res.body.paths["/api/challenges"].get).toBeDefined();
    expect(res.body.paths["/api/leaderboards/weekly"]).toBeDefined();
    expect(res.body.paths["/api/leaderboards/weekly"].get).toBeDefined();
    expect(res.body.paths["/api/invites/{code}"]).toBeDefined();
    expect(res.body.paths["/api/invites/{code}"].get).toBeDefined();
    expect(res.body.paths["/api/invites/{code}/accept"]).toBeDefined();
    expect(res.body.paths["/api/invites/{code}/accept"].post).toBeDefined();
    expect(res.body.paths["/api/me/summary"]).toBeDefined();
    expect(res.body.paths["/api/me/summary"].get).toBeDefined();
  });

  it("GET /api/docs returns Swagger UI HTML", async () => {
    const res = await request(app).get("/api/docs").expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("swagger-ui");
    expect(res.text).toContain("/api/openapi.json");
  });
});
