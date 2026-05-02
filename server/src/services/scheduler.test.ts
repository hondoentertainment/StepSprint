import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    stepSubmission: {
      findFirst: vi.fn(),
    },
    pushSubscription: {
      deleteMany: vi.fn(),
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

vi.mock("../config", () => ({
  config: {
    reminderNotificationHourLocal: 17,
    emailTransportConfigured: false,
  },
}));

import { hourlyReminderSweep } from "./scheduler";
import { prisma } from "../prisma";

const mockFindMany = vi.mocked(prisma.notificationPreference.findMany);

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
