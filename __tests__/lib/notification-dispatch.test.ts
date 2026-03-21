import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/emails/template-registry", () => ({
  renderNotificationEmail: vi.fn().mockResolvedValue({
    subject: "[Qorpera] Test",
    html: "<html>test</html>",
  }),
}));

import { prisma } from "@/lib/db";
import {
  sendNotification,
  sendNotificationToAdmins,
} from "@/lib/notification-dispatch";

const mockPref = prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>;
const mockCreate = prisma.notification.create as ReturnType<typeof vi.fn>;
const mockFindUsers = prisma.user.findMany as ReturnType<typeof vi.fn>;

const baseParams = {
  operatorId: "op1",
  userId: "user1",
  type: "situation_proposed",
  title: "Test title",
  body: "Test body",
  sourceType: "situation" as const,
  sourceId: "sit1",
};

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockOperatorFindUnique = (prisma as any).operator.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue({ id: "user1", email: "test@example.com", role: "member" });
  mockOperatorFindUnique.mockResolvedValue({ name: "Test Co" });
});

describe("sendNotification", () => {
  it("creates notification for in_app preference", async () => {
    mockPref.mockResolvedValue({ channel: "in_app" });
    mockCreate.mockResolvedValue({ id: "n1" });

    await sendNotification(baseParams);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        operatorId: "op1",
        userId: "user1",
        title: "Test title",
        body: "Test body",
        sourceType: "situation",
        sourceId: "sit1",
      },
    });
  });

  it("creates notification for both preference", async () => {
    mockPref.mockResolvedValue({ channel: "both" });
    mockCreate.mockResolvedValue({ id: "n1" });

    await sendNotification(baseParams);

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("skips notification for none preference", async () => {
    mockPref.mockResolvedValue({ channel: "none" });

    await sendNotification(baseParams);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("defaults to type-based channel when no preference found", async () => {
    mockPref.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "n1" });

    await sendNotification(baseParams);

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("never throws on prisma error", async () => {
    mockPref.mockResolvedValue({ channel: "in_app" });
    mockCreate.mockRejectedValue(new Error("DB down"));

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendNotification(baseParams)).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("sendNotificationToAdmins", () => {
  it("sends to all admins, excludes excludeUserId", async () => {
    mockFindUsers.mockResolvedValue([
      { id: "admin1" },
      { id: "admin2" },
      { id: "admin3" },
    ]);
    mockPref.mockResolvedValue({ channel: "in_app" });
    mockCreate.mockResolvedValue({ id: "n1" });

    const { userId: _, ...adminParams } = baseParams;
    await sendNotificationToAdmins({
      ...adminParams,
      excludeUserId: "admin2",
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);

    const createdUserIds = mockCreate.mock.calls.map(
      (call: [{ data: { userId: string } }]) => call[0].data.userId,
    );
    expect(createdUserIds).toContain("admin1");
    expect(createdUserIds).toContain("admin3");
    expect(createdUserIds).not.toContain("admin2");
  });
});
