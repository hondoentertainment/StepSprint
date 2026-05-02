import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { verifyReminderCronAuth } from "./cron";

describe("verifyReminderCronAuth", () => {
  it("rejects when secret is not configured", () => {
    const r = verifyReminderCronAuth({ headers: { authorization: "Bearer test-secret-min-16c" } }, undefined);
    expect(r).toEqual({ ok: false, status: 503, error: "Reminder cron is not configured" });
  });

  it("rejects without Bearer token", () => {
    expect(verifyReminderCronAuth({ headers: {} }, "abcdefghijklmnop")).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("rejects wrong token", () => {
    const r = verifyReminderCronAuth(
      { headers: { authorization: "Bearer wrongwrongwrong" } },
      "abcdefghijklmnop"
    );
    expect(r).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("accepts matching Bearer secret", () => {
    expect(
      verifyReminderCronAuth({ headers: { authorization: "Bearer abcdefghijklmnop" } }, "abcdefghijklmnop")
    ).toEqual({ ok: true });
  });
});

describe("POST /api/cron/reminder-sweep", () => {
  it("returns 503 when REMINDER_CRON_SECRET is not set", async () => {
    await request(app).post("/api/cron/reminder-sweep").expect(503);
  });
});
