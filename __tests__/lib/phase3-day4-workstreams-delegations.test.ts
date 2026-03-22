import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    workStream: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    workStreamItem: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    situation: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    initiative: { findFirst: vi.fn(), findUnique: vi.fn() },
    delegation: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    entity: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    goal: { findUnique: vi.fn() },
    situationType: { findFirst: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    userScope: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/execution-engine", () => ({
  completeHumanStep: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── WorkStream Tests ─────────────────────────────────────────────────────────

describe("createWorkStream", () => {
  it("creates record with correct fields", async () => {
    const { createWorkStream } = await import("@/lib/workstreams");
    mockPrisma.workStream.create.mockResolvedValue({
      id: "ws-1", operatorId: "op-1", title: "Test WS", description: "Desc",
      goalId: null, ownerAiEntityId: "ai-1", status: "active", parentWorkStreamId: null,
    });

    const result = await createWorkStream({
      operatorId: "op-1", title: "Test WS", description: "Desc", ownerAiEntityId: "ai-1",
    });

    expect(result.id).toBe("ws-1");
    expect(mockPrisma.workStream.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op-1", title: "Test WS", ownerAiEntityId: "ai-1",
      }),
    });
  });

  it("validates parent workstream operator ownership", async () => {
    const { createWorkStream } = await import("@/lib/workstreams");
    mockPrisma.workStream.findFirst.mockResolvedValue(null);

    await expect(createWorkStream({
      operatorId: "op-1", title: "T", description: "D", ownerAiEntityId: "ai-1", parentWorkStreamId: "ws-wrong",
    })).rejects.toThrow("Parent WorkStream not found");
  });
});

describe("addItemToWorkStream", () => {
  it("creates junction record", async () => {
    const { addItemToWorkStream } = await import("@/lib/workstreams");
    mockPrisma.workStream.findFirst.mockResolvedValue({ id: "ws-1" });
    mockPrisma.situation.findFirst.mockResolvedValue({ id: "sit-1" });
    mockPrisma.workStreamItem.upsert.mockResolvedValue({ id: "wsi-1", workStreamId: "ws-1", itemType: "situation", itemId: "sit-1" });

    const result = await addItemToWorkStream("ws-1", "situation", "sit-1", "op-1");
    expect(result.id).toBe("wsi-1");
  });

  it("rejects cross-operator item", async () => {
    const { addItemToWorkStream } = await import("@/lib/workstreams");
    mockPrisma.workStream.findFirst.mockResolvedValue({ id: "ws-1" });
    mockPrisma.situation.findFirst.mockResolvedValue(null); // not found for this operator

    await expect(addItemToWorkStream("ws-1", "situation", "sit-1", "op-1"))
      .rejects.toThrow("Situation not found");
  });
});

describe("recheckWorkStreamStatus", () => {
  it("auto-completes when all items are terminal", async () => {
    const { recheckWorkStreamStatus } = await import("@/lib/workstreams");
    mockPrisma.workStream.findUnique.mockResolvedValue({
      id: "ws-1", status: "active", parentWorkStreamId: null,
      items: [
        { id: "wsi-1", itemType: "situation", itemId: "sit-1" },
        { id: "wsi-2", itemType: "initiative", itemId: "init-1" },
      ],
    });
    mockPrisma.workStream.findMany.mockResolvedValue([]); // no children
    mockPrisma.situation.findUnique.mockResolvedValue({ status: "resolved" });
    mockPrisma.initiative.findUnique.mockResolvedValue({ status: "completed" });
    mockPrisma.workStream.update.mockResolvedValue({});

    await recheckWorkStreamStatus("ws-1");

    expect(mockPrisma.workStream.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "completed", completedAt: expect.any(Date) },
    });
  });

  it("reopens completed workstream when item becomes non-terminal", async () => {
    const { recheckWorkStreamStatus } = await import("@/lib/workstreams");
    mockPrisma.workStream.findUnique.mockResolvedValue({
      id: "ws-1", status: "completed", parentWorkStreamId: null,
      items: [
        { id: "wsi-1", itemType: "situation", itemId: "sit-1" },
      ],
    });
    mockPrisma.workStream.findMany.mockResolvedValue([]); // no children
    mockPrisma.situation.findUnique.mockResolvedValue({ status: "detected" }); // non-terminal
    mockPrisma.workStream.update.mockResolvedValue({});

    await recheckWorkStreamStatus("ws-1");

    expect(mockPrisma.workStream.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "active", completedAt: null },
    });
  });

  it("cascades to parent workstream", async () => {
    const { recheckWorkStreamStatus } = await import("@/lib/workstreams");
    // First call: child ws-2
    mockPrisma.workStream.findUnique.mockResolvedValueOnce({
      id: "ws-2", status: "active", parentWorkStreamId: "ws-1",
      items: [{ id: "wsi-1", itemType: "situation", itemId: "sit-1" }],
    });
    mockPrisma.workStream.findMany.mockResolvedValueOnce([]); // no children of ws-2
    mockPrisma.situation.findUnique.mockResolvedValueOnce({ status: "resolved" });
    mockPrisma.workStream.update.mockResolvedValue({});

    // Second call: parent ws-1 (via recursion)
    mockPrisma.workStream.findUnique.mockResolvedValueOnce({
      id: "ws-1", status: "active", parentWorkStreamId: null,
      items: [],
    });
    mockPrisma.workStream.findMany.mockResolvedValueOnce([{ id: "ws-2", status: "completed" }]); // child completed

    await recheckWorkStreamStatus("ws-2");

    // ws-2 should complete, then ws-1 should be checked
    expect(mockPrisma.workStream.findUnique).toHaveBeenCalledTimes(2);
  });

  it("cleans up orphaned items", async () => {
    const { recheckWorkStreamStatus } = await import("@/lib/workstreams");
    mockPrisma.workStream.findUnique.mockResolvedValue({
      id: "ws-1", status: "active", parentWorkStreamId: null,
      items: [{ id: "wsi-1", itemType: "situation", itemId: "sit-deleted" }],
    });
    mockPrisma.workStream.findMany.mockResolvedValue([]);
    mockPrisma.situation.findUnique.mockResolvedValue(null); // deleted
    mockPrisma.workStreamItem.delete.mockResolvedValue({});

    await recheckWorkStreamStatus("ws-1");

    expect(mockPrisma.workStreamItem.delete).toHaveBeenCalledWith({ where: { id: "wsi-1" } });
  });
});

describe("getWorkStreamContext", () => {
  it("returns structured context", async () => {
    const { getWorkStreamContext } = await import("@/lib/workstreams");
    mockPrisma.workStream.findUnique.mockResolvedValueOnce({
      id: "ws-1", title: "Test WS", description: "Desc", status: "active",
      goalId: "goal-1", parentWorkStreamId: null,
      items: [{ id: "wsi-1", itemType: "situation", itemId: "sit-1" }],
    });
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit-1", status: "detected", situationType: { name: "Overdue Invoice" },
    });
    mockPrisma.goal.findUnique.mockResolvedValue({ id: "goal-1", title: "Revenue", description: "Grow revenue" });

    const result = await getWorkStreamContext("ws-1");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test WS");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].summary).toBe("Overdue Invoice");
    expect(result!.goal?.title).toBe("Revenue");
  });
});

// ── Delegation Tests ─────────────────────────────────────────────────────────

describe("createDelegation", () => {
  it("AI to AI — status is pending, admin notification sent", async () => {
    const { createDelegation } = await import("@/lib/delegations");
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "from-ai", parentDepartmentId: "dept-1" });
    // toAiEntityId validation
    mockPrisma.entity.findFirst.mockResolvedValueOnce({ id: "from-ai" }); // from
    mockPrisma.entity.findFirst.mockResolvedValueOnce({ id: "to-ai" }); // to
    mockPrisma.delegation.create.mockResolvedValue({
      id: "del-1", operatorId: "op-1", fromAiEntityId: "from-ai", toAiEntityId: "to-ai",
      toUserId: null, status: "pending", instruction: "Do the thing",
    });

    const result = await createDelegation({
      operatorId: "op-1", fromAiEntityId: "from-ai", toAiEntityId: "to-ai",
      instruction: "Do the thing", context: {},
    });

    expect(result.status).toBe("pending");
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "delegation_received" }),
    );
  });

  it("AI to human — status is accepted, user notification sent", async () => {
    const { createDelegation } = await import("@/lib/delegations");
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "from-ai", parentDepartmentId: "dept-1" });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-1" });
    mockPrisma.delegation.create.mockResolvedValue({
      id: "del-2", operatorId: "op-1", fromAiEntityId: "from-ai", toAiEntityId: null,
      toUserId: "user-1", status: "accepted", instruction: "Call the client",
    });

    const result = await createDelegation({
      operatorId: "op-1", fromAiEntityId: "from-ai", toUserId: "user-1",
      instruction: "Call the client", context: {},
    });

    expect(result.status).toBe("accepted");
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "delegation_received" }),
    );
  });

  it("rejects when neither target provided", async () => {
    const { createDelegation } = await import("@/lib/delegations");
    await expect(createDelegation({
      operatorId: "op-1", fromAiEntityId: "from-ai",
      instruction: "Test", context: {},
    })).rejects.toThrow("Exactly one of toAiEntityId or toUserId");
  });
});

describe("approveDelegation", () => {
  it("moves to accepted and creates situation for personal AI target", async () => {
    const { approveDelegation } = await import("@/lib/delegations");
    mockPrisma.delegation.findFirst.mockResolvedValue({
      id: "del-1", operatorId: "op-1", fromAiEntityId: "from-ai", toAiEntityId: "personal-ai",
      status: "pending", instruction: "Handle this", context: null,
    });
    mockPrisma.delegation.update.mockResolvedValue({});
    mockPrisma.entity.findUnique.mockResolvedValueOnce({
      id: "personal-ai", entityType: { slug: "ai-agent" }, ownerUserId: "user-1",
    });
    // For createSituationFromDelegation
    mockPrisma.situationType.findFirst.mockResolvedValue({ id: "st-del" });
    mockPrisma.user.findUnique.mockResolvedValue({ entityId: "entity-user-1" });
    mockPrisma.situation.create.mockResolvedValue({ id: "sit-from-del" });

    await approveDelegation("del-1", "admin-1", "op-1");

    expect(mockPrisma.delegation.update).toHaveBeenCalledWith({
      where: { id: "del-1" }, data: { status: "accepted" },
    });
    expect(mockPrisma.situation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delegationId: "del-1", status: "detected" }),
    });
  });

  it("department AI target — no situation created", async () => {
    const { approveDelegation } = await import("@/lib/delegations");
    mockPrisma.delegation.findFirst.mockResolvedValue({
      id: "del-2", operatorId: "op-1", fromAiEntityId: "from-ai", toAiEntityId: "dept-ai",
      status: "pending", instruction: "Coordinate", context: null,
    });
    mockPrisma.delegation.update.mockResolvedValue({});
    mockPrisma.entity.findUnique.mockResolvedValue({
      id: "dept-ai", entityType: { slug: "department-ai" },
    });

    await approveDelegation("del-2", "admin-1", "op-1");

    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Delegation accepted" }),
    );
  });
});

describe("completeDelegation", () => {
  it("moves to completed with notes", async () => {
    const { completeDelegation } = await import("@/lib/delegations");
    mockPrisma.delegation.findFirst.mockResolvedValue({
      id: "del-1", operatorId: "op-1", fromAiEntityId: "from-ai", status: "accepted",
    });
    mockPrisma.delegation.update.mockResolvedValue({});
    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Sales AI", parentDepartmentId: "dept-1" });

    await completeDelegation("del-1", "user-1", "Done!", "op-1");

    expect(mockPrisma.delegation.update).toHaveBeenCalledWith({
      where: { id: "del-1" },
      data: expect.objectContaining({ status: "completed", completedNotes: "Done!" }),
    });
  });
});

describe("returnDelegation", () => {
  it("moves to returned with reason", async () => {
    const { returnDelegation } = await import("@/lib/delegations");
    mockPrisma.delegation.findFirst.mockResolvedValue({
      id: "del-1", operatorId: "op-1", fromAiEntityId: "from-ai", status: "accepted",
    });
    mockPrisma.delegation.update.mockResolvedValue({});
    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Sales AI" });

    await returnDelegation("del-1", "user-1", "Not my area", "op-1");

    expect(mockPrisma.delegation.update).toHaveBeenCalledWith({
      where: { id: "del-1" },
      data: { status: "returned", returnReason: "Not my area" },
    });
    expect(sendNotificationToAdmins).toHaveBeenCalled();
  });
});

// ── Peer Signal Tests ────────────────────────────────────────────────────────

describe("sendPeerSignal", () => {
  it("creates notification with sourceAiEntityId", async () => {
    const { sendPeerSignal } = await import("@/lib/peer-signals");
    mockPrisma.entity.findUnique.mockResolvedValue({ ownerDepartmentId: "dept-1" });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "admin-1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
    mockPrisma.notification.create.mockResolvedValue({});

    await sendPeerSignal({
      operatorId: "op-1",
      fromAiEntityId: "ai-sales",
      toAiEntityId: "ai-support",
      content: "Customer X has been very active",
    });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAiEntityId: "ai-sales",
        sourceType: "peer_signal",
      }),
    );
  });
});

describe("getPeerSignalsForAi", () => {
  it("returns signals and excludes own", async () => {
    const { getPeerSignalsForAi } = await import("@/lib/peer-signals");
    mockPrisma.entity.findUnique.mockResolvedValue({
      operatorId: "op-1", ownerDepartmentId: "dept-1", parentDepartmentId: null,
    });
    mockPrisma.userScope.findMany.mockResolvedValue([{ userId: "user-1" }]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: "n-1", body: "Signal from sales", sourceAiEntityId: "ai-sales", createdAt: new Date() },
    ]);

    const result = await getPeerSignalsForAi("ai-support");

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("Signal from sales");
    // Verify the query excludes own entity
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceAiEntityId: { not: "ai-support" },
        }),
      }),
    );
  });

  it("respects time filter", async () => {
    const { getPeerSignalsForAi } = await import("@/lib/peer-signals");
    mockPrisma.entity.findUnique.mockResolvedValue({
      operatorId: "op-1", ownerDepartmentId: "dept-1", parentDepartmentId: null,
    });
    mockPrisma.userScope.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    mockPrisma.notification.findMany.mockResolvedValue([]);

    const since = new Date("2026-03-01");
    await getPeerSignalsForAi("ai-support", since);

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gt: since },
        }),
      }),
    );
  });
});

// ── Reasoning Prompt Tests ───────────────────────────────────────────────────

describe("buildReasoningUserPrompt — workstream + delegation context", () => {
  it("includes WORKSTREAM CONTEXT when provided", async () => {
    const { buildReasoningUserPrompt } = await import("@/lib/reasoning-prompts");

    const result = buildReasoningUserPrompt({
      situationType: { name: "Test", description: "Test type", autonomyLevel: "supervised" },
      severity: 0.5, confidence: 0.8,
      triggerEntity: { displayName: "Customer X", type: "contact", category: "external", properties: {} },
      departments: [], departmentKnowledge: [],
      relatedEntities: { base: [], digital: [], external: [] },
      recentEvents: [], priorSituations: [],
      autonomyLevel: "supervised",
      permittedActions: [], blockedActions: [],
      businessContext: null,
      activityTimeline: { buckets: [], trend: "stable", totalSignals: 0 },
      communicationContext: { excerpts: [], sourceBreakdown: {} },
      crossDepartmentSignals: { signals: [] },
      connectorCapabilities: [],
      workStreamContexts: [{
        id: "ws-1", title: "Q1 Revenue Push", description: "Drive Q1 targets",
        status: "active",
        goal: { id: "g-1", title: "Revenue Growth", description: "Grow 20%" },
        items: [{ type: "initiative", id: "i-1", status: "executing", summary: "Email campaign" }],
        parent: null,
      }],
    });

    expect(result).toContain("WORKSTREAM CONTEXT");
    expect(result).toContain("Q1 Revenue Push");
    expect(result).toContain("Revenue Growth");
    expect(result).toContain("Email campaign");
  });

  it("includes DELEGATION SOURCE when provided", async () => {
    const { buildReasoningUserPrompt } = await import("@/lib/reasoning-prompts");

    const result = buildReasoningUserPrompt({
      situationType: { name: "Test", description: "Test type", autonomyLevel: "supervised" },
      severity: 0.5, confidence: 0.8,
      triggerEntity: { displayName: "Customer X", type: "contact", category: "external", properties: {} },
      departments: [], departmentKnowledge: [],
      relatedEntities: { base: [], digital: [], external: [] },
      recentEvents: [], priorSituations: [],
      autonomyLevel: "supervised",
      permittedActions: [], blockedActions: [],
      businessContext: null,
      activityTimeline: { buckets: [], trend: "stable", totalSignals: 0 },
      communicationContext: { excerpts: [], sourceBreakdown: {} },
      crossDepartmentSignals: { signals: [] },
      connectorCapabilities: [],
      delegationSource: {
        id: "del-1", instruction: "Follow up with client",
        context: { reason: "overdue" },
        fromAiEntityId: "hq-ai", fromAiEntityName: "HQ AI",
      },
    });

    expect(result).toContain("DELEGATION SOURCE");
    expect(result).toContain("HQ AI");
    expect(result).toContain("Follow up with client");
  });

  it("omits workstream and delegation sections when not provided", async () => {
    const { buildReasoningUserPrompt } = await import("@/lib/reasoning-prompts");

    const result = buildReasoningUserPrompt({
      situationType: { name: "Test", description: "Test type", autonomyLevel: "supervised" },
      severity: 0.5, confidence: 0.8,
      triggerEntity: { displayName: "Customer X", type: "contact", category: "external", properties: {} },
      departments: [], departmentKnowledge: [],
      relatedEntities: { base: [], digital: [], external: [] },
      recentEvents: [], priorSituations: [],
      autonomyLevel: "supervised",
      permittedActions: [], blockedActions: [],
      businessContext: null,
      activityTimeline: { buckets: [], trend: "stable", totalSignals: 0 },
      communicationContext: { excerpts: [], sourceBreakdown: {} },
      crossDepartmentSignals: { signals: [] },
      connectorCapabilities: [],
    });

    expect(result).not.toContain("WORKSTREAM CONTEXT");
    expect(result).not.toContain("DELEGATION SOURCE");
  });
});
