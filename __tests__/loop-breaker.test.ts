// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  prisma: {
    executionPlan: { update: vi.fn(), findUnique: vi.fn() },
    executionStep: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    situation: { update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    operator: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/emails/template-registry", () => ({
  renderNotificationEmail: vi.fn().mockResolvedValue({
    subject: "test",
    html: "<html/>",
  }),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/policy-evaluator", () => ({
  evaluateActionPolicies: vi.fn().mockResolvedValue({ permitted: [], blocked: [] }),
}));

vi.mock("@/lib/workstreams", () => ({
  recheckWorkStreamStatus: vi.fn(),
}));

vi.mock("@/lib/business-days", () => ({
  addBusinessDays: vi.fn(),
}));

import { executeStep } from "@/lib/execution-engine";
import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

const STEP_ID = "step-1";
const PLAN_ID = "plan-1";

function makeStep(overrides: Record<string, any> = {}) {
  return {
    id: STEP_ID,
    planId: PLAN_ID,
    sequenceOrder: 1,
    executionMode: "human_task",
    actionCapabilityId: null,
    assignedUserId: null,
    inputContext: null,
    description: "Do something",
    title: "Step 1",
    plan: {
      id: PLAN_ID,
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit1",
      totalStepExecutions: 3,
      maxStepExecutions: 15,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults — each test may override
  mockPrisma.executionStep.findUnique.mockResolvedValue(makeStep());
  mockPrisma.executionStep.findMany.mockResolvedValue([]);
  mockPrisma.executionStep.update.mockResolvedValue({});

  mockPrisma.executionPlan.update.mockResolvedValue({
    id: PLAN_ID,
    totalStepExecutions: 4,
    maxStepExecutions: 15,
    operatorId: "op1",
    sourceType: "situation",
    sourceId: "sit1",
  });

  mockPrisma.situation.update.mockResolvedValue({});

  mockPrisma.notification.create.mockResolvedValue({ id: "notif1" });
  mockPrisma.user.findUnique.mockResolvedValue({ id: "admin1", email: "admin@co.com", role: "admin" });
  mockPrisma.user.findMany.mockResolvedValue([{ id: "admin1" }]);
  mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
  // Billing gate + notification dispatch both read operator
  mockPrisma.operator.findUnique.mockResolvedValue({ displayName: "Test Co", billingStatus: "active" });
});

describe("loop breaker", () => {
  it("increments totalStepExecutions on each step execution", async () => {
    await executeStep(STEP_ID);

    expect(mockPrisma.executionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLAN_ID },
        data: { totalStepExecutions: { increment: 1 } },
      }),
    );
  });

  it("fails plan when totalStepExecutions exceeds max", async () => {
    mockPrisma.executionPlan.update.mockResolvedValueOnce({
      id: PLAN_ID,
      totalStepExecutions: 16,
      maxStepExecutions: 15,
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit1",
    });

    await executeStep(STEP_ID);

    // Second call should set status to failed
    expect(mockPrisma.executionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLAN_ID },
        data: { status: "failed" },
      }),
    );

    // Admin notification should have been created
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it("reverts source situation to proposed on loop break", async () => {
    mockPrisma.executionPlan.update.mockResolvedValueOnce({
      id: PLAN_ID,
      totalStepExecutions: 16,
      maxStepExecutions: 15,
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit1",
    });

    await executeStep(STEP_ID);

    expect(mockPrisma.situation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sit1" },
        data: { status: "proposed" },
      }),
    );
  });

  it("does not fail plan when under ceiling", async () => {
    mockPrisma.executionPlan.update.mockResolvedValueOnce({
      id: PLAN_ID,
      totalStepExecutions: 5,
      maxStepExecutions: 15,
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit1",
    });

    await executeStep(STEP_ID);

    // The first update call is the increment; there should be no second call with status: "failed"
    const updateCalls = mockPrisma.executionPlan.update.mock.calls;
    const failCalls = updateCalls.filter(
      (call: any[]) => call[0]?.data?.status === "failed",
    );
    expect(failCalls).toHaveLength(0);
  });
});
