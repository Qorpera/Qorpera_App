import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { findMany: vi.fn() },
  },
}));

import { compileDigest } from "@/lib/digest-compiler";
import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("compileDigest", () => {
  it("returns null for user with no recent notifications", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);

    const result = await compileDigest("user1", "op1");

    expect(result).toBeNull();
  });

  it("returns notifications within 24-hour window", async () => {
    const now = new Date();
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        title: "Invoice overdue",
        body: "Invoice #1234 is overdue.",
        sourceType: "situation",
        sourceId: "sit1",
        createdAt: now,
      },
      {
        title: "Connector error",
        body: "Google connector failed.",
        sourceType: null,
        sourceId: null,
        createdAt: now,
      },
    ]);

    const result = await compileDigest("user1", "op1");

    expect(result).not.toBeNull();
    expect(result!.notifications).toHaveLength(2);
    expect(result!.periodStart).toBeInstanceOf(Date);
    expect(result!.periodEnd).toBeInstanceOf(Date);
  });

  it("maps sourceType to notification type", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        title: "Test",
        body: "Test body",
        sourceType: "situation",
        sourceId: "sit1",
        createdAt: new Date(),
      },
    ]);

    const result = await compileDigest("user1", "op1");

    expect(result!.notifications[0].type).toBe("situation");
    expect(result!.notifications[0].viewUrl).toBe("/situations/sit1");
  });

  it("defaults to system_alert type when sourceType is null", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        title: "Alert",
        body: "Something happened",
        sourceType: null,
        sourceId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await compileDigest("user1", "op1");

    expect(result!.notifications[0].type).toBe("system_alert");
    expect(result!.notifications[0].viewUrl).toBe("/");
  });

  it("queries correct 24-hour time window", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);

    await compileDigest("user1", "op1");

    const call = mockPrisma.notification.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("user1");
    expect(call.where.operatorId).toBe("op1");
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    expect(call.where.createdAt.lte).toBeInstanceOf(Date);

    const diff =
      call.where.createdAt.lte.getTime() -
      call.where.createdAt.gte.getTime();
    // Should be approximately 24 hours (within 1 second tolerance)
    expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 1000);
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
  });
});
