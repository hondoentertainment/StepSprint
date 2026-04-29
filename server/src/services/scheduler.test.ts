import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
    },
    pushSubscription: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("./push", () => ({
  isPushEnabled: vi.fn(),
  sendPush: vi.fn(),
}));

import { sendDailyReminders } from "./scheduler";
import { prisma } from "../prisma";
import { isPushEnabled, sendPush } from "./push";

const mockFindMany = vi.mocked(prisma.notificationPreference.findMany);
const mockDeleteMany = vi.mocked(prisma.pushSubscription.deleteMany);
const mockIsPushEnabled = vi.mocked(isPushEnabled);
const mockSendPush = vi.mocked(sendPush);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("sendDailyReminders", () => {
  it("is a no-op when push is disabled", async () => {
    mockIsPushEnabled.mockReturnValue(false);
    await sendDailyReminders();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("sends push to users with dailyReminder enabled", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      {
        id: "pref-1",
        userId: "user-1",
        dailyReminder: true,
        user: {
          id: "user-1",
          email: "a@example.com",
          name: null,
          passwordHash: null,
          role: "PARTICIPANT" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushSubscriptions: [
            {
              id: "sub-1",
              userId: "user-1",
              endpoint: "https://push.example.com/1",
              p256dh: "key1",
              auth: "auth1",
              createdAt: new Date(),
            },
          ],
        },
      },
    ] as never);
    mockSendPush.mockResolvedValue({ statusCode: 201 } as never);

    await sendDailyReminders();

    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/1", keys: { p256dh: "key1", auth: "auth1" } },
      expect.objectContaining({ title: "StepSprint" })
    );
  });

  it("removes stale subscriptions on 410", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      {
        id: "pref-2",
        userId: "user-2",
        dailyReminder: true,
        user: {
          id: "user-2",
          email: "b@example.com",
          name: null,
          passwordHash: null,
          role: "PARTICIPANT" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushSubscriptions: [
            {
              id: "sub-2",
              userId: "user-2",
              endpoint: "https://push.example.com/stale",
              p256dh: "k2",
              auth: "a2",
              createdAt: new Date(),
            },
          ],
        },
      },
    ] as never);
    mockSendPush.mockRejectedValue(
      Object.assign(new Error("Gone"), { statusCode: 410 })
    );
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await sendDailyReminders();

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ["https://push.example.com/stale"] } },
    });
  });

  it("skips users with no push subscriptions", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      {
        id: "pref-3",
        userId: "user-3",
        dailyReminder: true,
        user: {
          id: "user-3",
          email: "c@example.com",
          name: null,
          passwordHash: null,
          role: "PARTICIPANT" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushSubscriptions: [],
        },
      },
    ] as never);

    await sendDailyReminders();

    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
