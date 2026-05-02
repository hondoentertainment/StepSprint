import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    },
    stepSubmission: {
      findFirst: vi.fn(),
    },
    pushSubscription: {
      deleteMany: vi.fn(),
    },
    stepSubmission: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("./push", () => ({
  isPushEnabled: vi.fn(() => false),
  sendPush: vi.fn(),
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
vi.mock("../config", () => ({
  config: {
    reminderNotificationHourLocal: 17,
    emailTransportConfigured: false,
  },
}));

import { hourlyReminderSweep } from "./scheduler";
import { prisma } from "../prisma";

const mockFindMany = vi.mocked(prisma.notificationPreference.findMany);
const mockDeleteMany = vi.mocked(prisma.pushSubscription.deleteMany);
const mockFindFirst = vi.mocked(prisma.stepSubmission.findFirst);
const mockIsPushEnabled = vi.mocked(isPushEnabled);
const mockSendPush = vi.mocked(sendPush);

// Set system time to 17:00 UTC so hour matches the default reminderNotificationHourLocal (17)
// and use UTC timezone in test challenges so the hour check passes.
const FIXED_TIME = new Date("2025-01-15T17:00:00.000Z");

beforeEach(() => {
  vi.setSystemTime(FIXED_TIME);
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  vi.mocked(prisma.notificationPreference.update).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Build a minimal pref record for mocking. */
function buildPref(overrides: {
  userId?: string;
  pushSubscriptions?: { id: string; userId: string; endpoint: string; p256dh: string; auth: string; createdAt: Date }[];
  memberships?: { challenge: { id: string; name: string; locked: boolean; timezone: string; startDate: Date; endDate: Date } }[];
  lastDailyReminderSentAt?: Date | null;
}) {
  const userId = overrides.userId ?? "user-1";
  return {
    id: "pref-1",
    userId,
    dailyReminder: true,
    lastDailyReminderSentAt: overrides.lastDailyReminderSentAt ?? null,
    user: {
      id: userId,
      email: "a@example.com",
      name: null,
      passwordHash: null,
      role: "PARTICIPANT" as const,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      pushSubscriptions: overrides.pushSubscriptions ?? [],
      memberships: overrides.memberships ?? [],
    },
  };
}

/** A challenge with UTC timezone active around the fixed time (2025-01-15). */
const activeChallenge = {
  id: "challenge-1",
  name: "January Challenge",
  locked: false,
  timezone: "UTC",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-01-31"),
};

const defaultSub = {
  id: "sub-1",
  userId: "user-1",
  endpoint: "https://push.example.com/1",
  p256dh: "key1",
  auth: "auth1",
  createdAt: new Date(),
};

describe("hourlyReminderSweep", () => {
  it("does not send push when user has no actionable challenges", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([buildPref({ memberships: [] })] as never);

    await hourlyReminderSweep();

    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("sends push to users with an active challenge when push is enabled", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      buildPref({
        pushSubscriptions: [defaultSub],
        memberships: [{ challenge: activeChallenge }],
      }),
    ] as never);
    mockSendPush.mockResolvedValue({ statusCode: 201 } as never);

    await hourlyReminderSweep();

    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/1", keys: { p256dh: "key1", auth: "auth1" } },
      expect.objectContaining({ title: "StepSprint" })
    );
  });

  it("removes stale subscriptions on 410", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      buildPref({
        userId: "user-2",
        pushSubscriptions: [{ ...defaultSub, id: "sub-2", userId: "user-2", endpoint: "https://push.example.com/stale" }],
        memberships: [{ challenge: activeChallenge }],
      }),
    ] as never);
    mockSendPush.mockRejectedValue(
      Object.assign(new Error("Gone"), { statusCode: 410 })
    );
    mockDeleteMany.mockResolvedValue({ count: 1 } as never);

    await hourlyReminderSweep();

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ["https://push.example.com/stale"] } },
    });
  });

  it("skips push when user has no push subscriptions", async () => {
    mockIsPushEnabled.mockReturnValue(true);
    mockFindMany.mockResolvedValue([
      buildPref({
        pushSubscriptions: [],
        memberships: [{ challenge: activeChallenge }],
      }),
    ] as never);

    await hourlyReminderSweep();

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

describe("hourlyReminderSweep", () => {
  it("completes when no users opted into reminders", async () => {
    await expect(hourlyReminderSweep()).resolves.toBeUndefined();
    expect(mockFindMany).toHaveBeenCalledOnce();
  });
});
