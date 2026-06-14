import { afterAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import { prisma } from "../prisma";

describe("Push subscription routes", () => {
  const endpointSuffix = crypto.randomBytes(6).toString("hex");
  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${endpointSuffix}`;

  afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  });

  async function loginCookie(): Promise<string[] | null> {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user1@stepsprint.local", password: "password123" });
    const cookie = loginRes.headers["set-cookie"];
    if (!cookie) return null;
    return Array.isArray(cookie) ? cookie : [cookie];
  }

  it("POST /api/me/notifications/push/subscribe stores the subscription (happy path)", async () => {
    const cookie = await loginCookie();
    if (!cookie) return;

    await request(app)
      .post("/api/me/notifications/push/subscribe")
      .set("Cookie", cookie)
      .send({
        endpoint,
        keys: {
          p256dh: "BNNQoGm2tBFZ5YQxDFzGzQY_test_key",
          auth: "auth_test_secret",
        },
      })
      .expect(204);

    const stored = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(stored).not.toBeNull();
    expect(stored?.p256dh).toBe("BNNQoGm2tBFZ5YQxDFzGzQY_test_key");
    expect(stored?.auth).toBe("auth_test_secret");
  });

  it("POST /api/me/notifications/push/subscribe returns 400 on malformed body", async () => {
    const cookie = await loginCookie();
    if (!cookie) return;

    const res = await request(app)
      .post("/api/me/notifications/push/subscribe")
      .set("Cookie", cookie)
      .send({ endpoint: "not-a-url", keys: { p256dh: "" } })
      .expect(400);
    expect(res.body).toHaveProperty("error");
  });
});
