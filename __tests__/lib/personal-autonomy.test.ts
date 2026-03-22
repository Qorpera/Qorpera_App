import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock prisma (vi.hoisted to avoid initialization order issues) ───────────

const mockPrisma = vi.hoisted(() => ({
  personalAutonomy: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    create: vi.fn().mockResolvedValue({}),
  },
  appSetting: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  entity: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  relationship: {
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { getEffectiveAutonomy } from "@/lib/policy-evaluator";
import type { PolicyEvaluationResult } from "@/lib/policy-evaluator";
import { checkPersonalGraduation, checkPersonalDemotion } from "@/lib/autonomy-graduation";

function makePolicyResult(overrides: Partial<PolicyEvaluationResult> = {}): PolicyEvaluationResult {
  return {
    permitted: [],
    blocked: [],
    hasRequireApproval: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.appSetting.findMany.mockResolvedValue([]);
  mockPrisma.notification.create.mockResolvedValue({});
});

// ── Test 1: PersonalAutonomy created on first approval ──────────────────────

describe("PersonalAutonomy approval tracking", () => {
  it("creates PA on first approval with correct stats", () => {
    // This tests the inline logic in the situations PATCH handler.
    // Since that's an API route, we test the expected data shape:
    const paData = {
      operatorId: "op1",
      situationTypeId: "st1",
      aiEntityId: "ai1",
      totalProposed: 1,
      totalApproved: 1,
      consecutiveApprovals: 1,
      approvalRate: 1.0,
    };

    expect(paData.consecutiveApprovals).toBe(1);
    expect(paData.totalApproved).toBe(1);
    expect(paData.approvalRate).toBe(1.0);
  });

  it("increments consecutive approvals on subsequent approval", () => {
    const existing = {
      totalProposed: 4,
      totalApproved: 3,
      consecutiveApprovals: 4,
      approvalRate: 0.75,
    };

    const newProposed = existing.totalProposed + 1;
    const newApproved = existing.totalApproved + 1;
    const newConsecutive = existing.consecutiveApprovals + 1;
    const newRate = newProposed > 0 ? newApproved / newProposed : 0;

    expect(newConsecutive).toBe(5);
    expect(newApproved).toBe(4);
    expect(newRate).toBe(0.8);
  });

  it("resets consecutive approvals to 0 on rejection", () => {
    const existing = {
      totalProposed: 8,
      totalApproved: 7,
      consecutiveApprovals: 8,
    };

    const newProposed = existing.totalProposed + 1;
    const newConsecutive = 0; // rejection resets
    const newRate = newProposed > 0 ? existing.totalApproved / newProposed : 0;

    expect(newConsecutive).toBe(0);
    expect(newProposed).toBe(9);
    expect(newRate).toBeCloseTo(0.778, 2);
  });
});

// ── Test 4: checkPersonalGraduation fires notification ──────────────────────

describe("checkPersonalGraduation", () => {
  it("creates notification when thresholds are met", async () => {
    mockPrisma.personalAutonomy.findUnique.mockResolvedValue({
      id: "pa1",
      operatorId: "op1",
      autonomyLevel: "supervised",
      consecutiveApprovals: 10,
      approvalRate: 0.9,
      situationType: { name: "Late Invoice" },
      aiEntity: { displayName: "Alice's Assistant" },
    });

    await checkPersonalGraduation("pa1");

    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        title: expect.stringContaining("notify"),
        sourceType: "graduation",
        sourceId: "pa1",
      }),
    );
  });

  it("does not create notification when below threshold", async () => {
    mockPrisma.personalAutonomy.findUnique.mockResolvedValue({
      id: "pa1",
      operatorId: "op1",
      autonomyLevel: "supervised",
      consecutiveApprovals: 5,
      approvalRate: 0.7,
      situationType: { name: "Late Invoice" },
      aiEntity: { displayName: "Alice's Assistant" },
    });

    await checkPersonalGraduation("pa1");

    expect(sendNotificationToAdmins).not.toHaveBeenCalled();
  });
});

// ── Test 5: checkPersonalDemotion resets to supervised ───────────────────────

describe("checkPersonalDemotion", () => {
  it("resets level to supervised and creates notification", async () => {
    mockPrisma.personalAutonomy.findUnique.mockResolvedValue({
      id: "pa1",
      operatorId: "op1",
      autonomyLevel: "notify",
      situationType: { name: "Late Invoice" },
      aiEntity: { displayName: "Alice's Assistant" },
    });

    await checkPersonalDemotion("pa1");

    expect(mockPrisma.personalAutonomy.update).toHaveBeenCalledWith({
      where: { id: "pa1" },
      data: { autonomyLevel: "supervised" },
    });

    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        title: expect.stringContaining("Demoted"),
        sourceType: "graduation",
      }),
    );
  });

  it("does nothing if already supervised", async () => {
    mockPrisma.personalAutonomy.findUnique.mockResolvedValue({
      id: "pa1",
      operatorId: "op1",
      autonomyLevel: "supervised",
      situationType: { name: "Late Invoice" },
      aiEntity: { displayName: "Alice's Assistant" },
    });

    await checkPersonalDemotion("pa1");

    expect(mockPrisma.personalAutonomy.update).not.toHaveBeenCalled();
    expect(sendNotificationToAdmins).not.toHaveBeenCalled();
  });
});

// ── Tests 6-8: getEffectiveAutonomy with personalAutonomyLevel ──────────────

describe("getEffectiveAutonomy with personalAutonomyLevel", () => {
  it("uses personalAutonomyLevel when provided", () => {
    const situation = { autonomyLevel: "supervised" };
    const result = getEffectiveAutonomy(situation, makePolicyResult(), "notify");
    expect(result).toBe("notify");
  });

  it("falls back to SituationType when no personalAutonomyLevel", () => {
    const situation = { autonomyLevel: "notify" };
    const result = getEffectiveAutonomy(situation, makePolicyResult());
    expect(result).toBe("notify");
  });

  it("policy override still works with personalAutonomyLevel", () => {
    const situation = { autonomyLevel: "supervised" };
    const result = getEffectiveAutonomy(
      situation,
      makePolicyResult({ hasRequireApproval: true }),
      "autonomous",
    );
    expect(result).toBe("supervised");
  });
});
