import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

describe("OpenAPI docs in production", () => {
  let baseEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    baseEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...baseEnv };
    vi.resetModules();
  });

  it("returns 404 for OpenAPI JSON when NODE_ENV is production and flag unset", async () => {
    vi.resetModules();
    process.env = {
      ...baseEnv,
      NODE_ENV: "production",
      VITEST: "true",
    };
    delete process.env.OPENAPI_DOCS_ENABLED;

    const { default: app } = await import("../app");
    await request(app).get("/api/openapi.json").expect(404);
    await request(app).get("/api/docs").expect(404);
  });

  it("serves OpenAPI JSON when OPENAPI_DOCS_ENABLED=true in production", async () => {
    vi.resetModules();
    process.env = {
      ...baseEnv,
      NODE_ENV: "production",
      OPENAPI_DOCS_ENABLED: "true",
      VITEST: "true",
    };

    const { default: app } = await import("../app");
    const res = await request(app).get("/api/openapi.json").expect(200);
    expect(res.body.openapi).toMatch(/^3\.0/);
  });
});
