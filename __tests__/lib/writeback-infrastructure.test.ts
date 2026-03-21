import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    executionPlan: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    executionStep: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    actionCapability: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    sourceConnector: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    situation: { findUnique: vi.fn(), findFirst: vi.fn() },
    entity: { findUnique: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    followUp: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    userScope: { findMany: vi.fn(), findFirst: vi.fn() },
    event: { create: vi.fn(), update: vi.fn() },
    entityType: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    entityProperty: { create: vi.fn() },
    propertyValue: { findMany: vi.fn() },
    workStreamItem: { findMany: vi.fn() },
    priorityOverride: { delete: vi.fn() },
    operator: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn(),
  sendNotificationToAdmins: vi.fn(),
}));

vi.mock("@/lib/policy-evaluator", () => ({
  evaluateActionPolicies: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  upsertEntity: vi.fn().mockResolvedValue("entity-1"),
  resolveEntity: vi.fn(),
  relateEntities: vi.fn(),
}));

vi.mock("@/lib/entity-model-store", () => ({
  getEntityType: vi.fn(),
}));

vi.mock("@/lib/situation-detector", () => ({
  notifySituationDetectors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/situation-resolver", () => ({
  checkForSituationResolution: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { upsertEntity } from "@/lib/entity-resolution";
import { getEntityType } from "@/lib/entity-model-store";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { executeStep } from "@/lib/execution-engine";
import { materializeEvent } from "@/lib/event-materializer";

beforeEach(() => {
  vi.clearAllMocks();
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ channel: "in_app" });
  (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "n1" });
  (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "admin1" });
  (prisma.userScope.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.userScope.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.followUp.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "fu1" });
  (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
  // Billing gate: operator must be active for execution to proceed
  ((prisma as any).operator.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ billingStatus: "active" });
  // Loop breaker — under ceiling
  (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "plan1", totalStepExecutions: 1, maxStepExecutions: 15,
    operatorId: "op1", sourceType: "situation", sourceId: "sit1",
  });
});

// ── 1. ActionCapability registration ────────────────────────────────────────

describe("ActionCapability registration", () => {
  it("registers write capabilities from provider definition", async () => {
    const provider = {
      id: "google",
      name: "Google",
      writeCapabilities: [
        { slug: "send_email", name: "Send Email", description: "Send an email via Gmail", inputSchema: { type: "object" } },
        { slug: "create_doc", name: "Create Document", description: "Create a Google Doc", inputSchema: { type: "object" } },
      ],
    };

    (prisma.actionCapability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.actionCapability.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cap1" });

    await registerConnectorCapabilities("conn1", "op1", provider as any);

    expect(prisma.actionCapability.create).toHaveBeenCalledTimes(2);
    expect(prisma.actionCapability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op1",
        connectorId: "conn1",
        slug: "send_email",
        name: "Send Email",
        description: "Send an email via Gmail",
        writeBackStatus: "pending",
      }),
    });
  });

  it("skips already-registered capabilities", async () => {
    const provider = {
      id: "google",
      name: "Google",
      writeCapabilities: [
        { slug: "send_email", name: "Send Email", description: "Send via Gmail", inputSchema: {} },
      ],
    };

    (prisma.actionCapability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "existing" });

    await registerConnectorCapabilities("conn1", "op1", provider as any);

    expect(prisma.actionCapability.create).not.toHaveBeenCalled();
  });

  it("does nothing for providers without writeCapabilities", async () => {
    const provider = { id: "hubspot", name: "HubSpot" };

    await registerConnectorCapabilities("conn1", "op1", provider as any);

    expect(prisma.actionCapability.findFirst).not.toHaveBeenCalled();
    expect(prisma.actionCapability.create).not.toHaveBeenCalled();
  });
});

// ── 2-4. writeBackStatus gate ────────────────────────────────────────────────

describe("writeBackStatus gate", () => {
  const basePlan = { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" };
  const baseStep = {
    id: "step1",
    planId: "plan1",
    sequenceOrder: 1,
    executionMode: "action",
    actionCapabilityId: "cap1",
    assignedUserId: null,
    inputContext: null,
    title: "Send email",
    description: "Send an email",
    plan: basePlan,
  };

  it("step with pending capability fails with WRITEBACK_NOT_ENABLED", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", slug: "send_email", description: "Send email",
      enabled: true, connectorId: "conn1", writeBackStatus: "pending",
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google",
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    const errorMsg = JSON.parse(failCall![0].data.errorMessage);
    expect(errorMsg.code).toBe("WRITEBACK_NOT_ENABLED");
    expect(errorMsg.capabilitySlug).toBe("send_email");
  });

  it("step with disabled capability fails with WRITEBACK_NOT_ENABLED", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", slug: "send_email", description: "Send email",
      enabled: true, connectorId: "conn1", writeBackStatus: "disabled",
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google",
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    const errorMsg = JSON.parse(failCall![0].data.errorMessage);
    expect(errorMsg.code).toBe("WRITEBACK_NOT_ENABLED");

    // Admin notification sent
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system_alert",
        title: expect.stringContaining("Write-back not enabled"),
      }),
    );
  });

  it("step with enabled capability proceeds to execution", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", slug: "send_email", description: "Send email",
      enabled: true, connectorId: "conn1", writeBackStatus: "enabled",
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{"access_token":"t"}',
    });
    const mockExecuteAction = vi.fn().mockResolvedValue({
      success: true,
      result: { threadId: "t1", recipients: ["a@b.com"], subject: "Hi" },
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: mockExecuteAction,
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.sourceConnector.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(mockExecuteAction).toHaveBeenCalled();
    const completedCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "completed",
    );
    expect(completedCall).toBeDefined();
  });
});

// ── 5-6. executeAction routing ──────────────────────────────────────────────

describe("executeAction routing", () => {
  const basePlan = { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" };
  const baseStep = {
    id: "step1",
    planId: "plan1",
    sequenceOrder: 1,
    executionMode: "action",
    actionCapabilityId: "cap1",
    assignedUserId: null,
    inputContext: JSON.stringify({ params: { to: "user@test.com", subject: "Test" } }),
    title: "Send email",
    description: "Send an email",
    plan: basePlan,
  };

  it("provider's executeAction is called with correct params", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", slug: "send_email", description: "Send email",
      enabled: true, connectorId: "conn1", writeBackStatus: "enabled",
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{"access_token":"tok"}',
    });
    const mockExecuteAction = vi.fn().mockResolvedValue({
      success: true, result: { threadId: "t1", recipients: ["user@test.com"], subject: "Test" },
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({ executeAction: mockExecuteAction });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.sourceConnector.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "tok" }),
      "send_email",
      expect.objectContaining({ to: "user@test.com", subject: "Test" }),
    );
  });

  it("provider without executeAction fails the step cleanly", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", slug: "send_email", description: "Send email",
      enabled: true, connectorId: "conn1", writeBackStatus: "enabled",
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{}',
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      // No executeAction method
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    expect(failCall![0].data.errorMessage).toContain("does not support action execution");
  });
});

// ── 7-8. Priority boost for spawned situations ──────────────────────────────

describe("Priority boost for spawned situations", () => {
  it("situation with spawningStepId inherits parent priority", async () => {
    const { computePlanPriorityWithBreakdown } = await import("@/lib/prioritization-engine");

    // Mock plan
    (prisma.executionPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan2",
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit1",
      status: "pending",
      currentStepOrder: 1,
      createdAt: new Date(),
      priorityOverride: null,
      steps: [{ id: "s1" }],
    });

    // Mock source situation with spawningStepId
    (prisma.situation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      triggerEntityId: null,
      spawningStepId: "parent-step-1",
      situationType: { slug: "overdue_invoice", detectionLogic: "{}" },
    });

    // Mock spawning step's plan priority
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: { priorityScore: 85 },
    });

    // Mock FollowUp query (empty)
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Mock workstream query (empty)
    (prisma.workStreamItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await computePlanPriorityWithBreakdown("plan2");

    // Score should be at least 85 (inherited from parent)
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("meeting_request situation gets minimum 75 floor", async () => {
    const { computePlanPriorityWithBreakdown } = await import("@/lib/prioritization-engine");

    (prisma.executionPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan3",
      operatorId: "op1",
      sourceType: "situation",
      sourceId: "sit2",
      status: "pending",
      currentStepOrder: 1,
      createdAt: new Date(),
      priorityOverride: null,
      steps: [{ id: "s1" }],
    });

    // Mock situation with meeting_request type and spawningStepId
    (prisma.situation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      triggerEntityId: null,
      spawningStepId: "parent-step-2",
      situationType: { slug: "meeting_request", detectionLogic: "{}" },
    });

    // Parent plan has low priority
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: { priorityScore: 30 },
    });

    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.workStreamItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await computePlanPriorityWithBreakdown("plan3");

    // Score should be at least 75 (meeting_request floor)
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});

// ── 9-10. Materializer: ticket and conversation ─────────────────────────────

describe("Materializer rules", () => {
  it("ticket.synced event creates ticket entity", async () => {
    // Ensure entity type exists
    (prisma.entityType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "et-ticket",
      slug: "ticket",
      properties: [
        { slug: "number" }, { slug: "subject" }, { slug: "status" },
        { slug: "priority" }, { slug: "channel" }, { slug: "assignee" },
        { slug: "created-date" },
      ],
    });
    (getEntityType as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "et-ticket", slug: "ticket" });
    (prisma.event.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const event = {
      id: "ev1",
      connectorId: "conn1",
      source: "helpdesk",
      eventType: "ticket.synced",
      payload: JSON.stringify({
        id: "t-123",
        number: "TICK-001",
        subject: "Login issue",
        status: "open",
        priority: "high",
        channel: "email",
        assignee: "support@co.com",
        created_date: "2026-03-20",
      }),
      processedAt: null,
      materializationError: null,
    };

    const result = await materializeEvent("op1", event);

    expect(result.status).toBe("materialized");
    expect(result.entityIds).toBeDefined();
    expect(upsertEntity).toHaveBeenCalledWith(
      "op1",
      "ticket",
      expect.objectContaining({
        displayName: "Login issue",
        properties: expect.objectContaining({
          number: "TICK-001",
          status: "open",
          priority: "high",
        }),
      }),
      expect.objectContaining({
        sourceSystem: "helpdesk",
        externalId: "t-123",
      }),
    );
  });

  it("conversation.synced event creates conversation entity", async () => {
    (prisma.entityType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "et-conv",
      slug: "conversation",
      properties: [
        { slug: "subject" }, { slug: "status" }, { slug: "channel" },
        { slug: "assignee" }, { slug: "message-count" }, { slug: "created-date" },
      ],
    });
    (getEntityType as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "et-conv", slug: "conversation" });
    (prisma.event.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const event = {
      id: "ev2",
      connectorId: "conn1",
      source: "intercom",
      eventType: "conversation.synced",
      payload: JSON.stringify({
        id: "conv-456",
        subject: "Billing question",
        status: "active",
        channel: "chat",
        assignee: "agent@co.com",
        message_count: 7,
        created_date: "2026-03-19",
      }),
      processedAt: null,
      materializationError: null,
    };

    const result = await materializeEvent("op1", event);

    expect(result.status).toBe("materialized");
    expect(upsertEntity).toHaveBeenCalledWith(
      "op1",
      "conversation",
      expect.objectContaining({
        displayName: "Billing question",
        properties: expect.objectContaining({
          channel: "chat",
          "message-count": "7",
        }),
      }),
      expect.objectContaining({
        sourceSystem: "intercom",
        externalId: "conv-456",
      }),
    );
  });
});
