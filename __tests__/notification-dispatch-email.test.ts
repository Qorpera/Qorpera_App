import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
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

import { sendNotification } from "@/lib/notification-dispatch";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { renderNotificationEmail } from "@/emails/template-registry";

const mockPrisma = prisma as any;
const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockRenderEmail = renderNotificationEmail as ReturnType<typeof vi.fn>;

const baseParams = {
  operatorId: "op1",
  userId: "user1",
  type: "situation_proposed",
  title: "Test",
  body: "Test body",
  linkUrl: "/situations/1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({ id: "notif1" });
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "user1",
    email: "test@example.com",
    role: "admin",
    locale: "en",
  });
  mockPrisma.operator.findUnique.mockResolvedValue({ displayName: "Test Co" });
});

describe("sendNotification", () => {
  it("with channel 'in_app' creates notification but no email", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "in_app",
    });

    await sendNotification(baseParams);

    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("with channel 'email' creates notification AND sends email", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "email",
    });

    await sendNotification(baseParams);

    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: "[Qorpera] Test",
      })
    );
  });

  it("with channel 'both' creates notification AND sends email", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "both",
    });

    await sendNotification(baseParams);

    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("with channel 'none' creates neither notification nor email", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "none",
    });

    await sendNotification(baseParams);

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("missing preference falls back to type-based default", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
    // situation_proposed default is "both"
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user1",
      email: "test@example.com",
      role: "admin",
    });

    await sendNotification(baseParams);

    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("missing preference uses in_app default for insight_discovered", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
    // insight_discovered default is "in_app"
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user1",
      email: "test@example.com",
      role: "member",
    });

    await sendNotification({
      ...baseParams,
      type: "insight_discovered",
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("email send failure does not throw", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "both",
    });
    mockSendEmail.mockResolvedValue({ success: false, error: "API error" });

    // Should not throw
    await expect(sendNotification(baseParams)).resolves.toBeUndefined();
    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
  });

  it("emailContext is passed through to template renderer", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "email",
    });

    const emailContext = {
      situationTitle: "Invoice overdue",
      entityName: "Acme",
      summary: "15 days overdue",
    };

    await sendNotification({ ...baseParams, emailContext });

    expect(mockRenderEmail).toHaveBeenCalledWith(
      "situation_proposed",
      expect.objectContaining({
        situationTitle: "Invoice overdue",
        entityName: "Acme",
        summary: "15 days overdue",
        viewUrl: "/situations/1",
      }),
      "Test Co",
      "en"
    );
  });

  it("falls back to generic template when no emailContext", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      channel: "email",
    });

    await sendNotification(baseParams);

    expect(mockRenderEmail).toHaveBeenCalledWith(
      "situation_proposed",
      expect.objectContaining({
        content: "Test body",
        viewUrl: "/situations/1",
      }),
      "Test Co",
      "en"
    );
  });
});
