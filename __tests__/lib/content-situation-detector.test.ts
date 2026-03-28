import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: {
      findUnique: vi.fn(),
    },
    situation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    situationType: {
      upsert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    notification: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    operator: {
      findUnique: vi.fn(),
    },
    evaluationLog: {
      create: vi.fn().mockResolvedValue({ id: "eval-001" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/entity-resolution", () => ({
  resolveEntity: vi.fn(),
}));

vi.mock("@/lib/activity-pipeline", () => ({
  resolveDepartmentsFromEmails: vi.fn(),
}));

vi.mock("@/lib/worker-dispatch", () => ({
  enqueueWorkerJob: vi.fn().mockResolvedValue("job-001"),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { resolveEntity } from "@/lib/entity-resolution";
import { resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  ensureActionRequiredType,
  ensureAwarenessType,
  type CommunicationItem,
} from "@/lib/content-situation-detector";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  entity: { findUnique: ReturnType<typeof vi.fn> };
  situation: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  situationType: { upsert: ReturnType<typeof vi.fn> };
  notification: { create: ReturnType<typeof vi.fn> };
  evaluationLog: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;
const mockResolveEntity = resolveEntity as ReturnType<typeof vi.fn>;
const mockResolveDepts = resolveDepartmentsFromEmails as ReturnType<typeof vi.fn>;
const mockEnqueueJob = enqueueWorkerJob as ReturnType<typeof vi.fn>;

function makeEmail(overrides: Partial<CommunicationItem> & { metadata?: Record<string, unknown> } = {}): CommunicationItem {
  return {
    sourceType: "email",
    sourceId: "msg-001",
    content: "Please prepare the Q3 report by Friday.",
    metadata: {
      direction: "received",
      from: "boss@external.com",
      to: "alice@company.com",
      subject: "Q3 Report",
      date: "2026-03-13T10:00:00Z",
    },
    participantEmails: ["alice@company.com", "boss@external.com"],
    ...overrides,
  };
}

function setupStandardMocks() {
  // Resolve alice to entity
  mockResolveEntity.mockImplementation(async (_opId: string, hints: { identityValues?: { email?: string } }) => {
    const email = hints.identityValues?.email;
    if (email === "alice@company.com") return "entity-alice";
    if (email === "bob@company.com") return "entity-bob";
    return null;
  });

  // Entity lookup
  mockPrisma.entity.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "entity-alice")
      return {
        displayName: "Alice Smith",
        propertyValues: [{ value: "Analyst", property: { slug: "job-title" } }],
      };
    if (where.id === "entity-bob")
      return {
        displayName: "Bob Jones",
        propertyValues: [{ value: "Engineer", property: { slug: "role" } }],
      };
    if (where.id === "dept-finance")
      return { displayName: "Finance & Operations" };
    return null;
  });

  // Departments
  mockResolveDepts.mockResolvedValue(["dept-finance"]);

  // No open situations by default
  mockPrisma.situation.findMany.mockResolvedValue([]);

  // SituationType upsert
  mockPrisma.situationType.upsert.mockResolvedValue({ id: "sit-type-action-req" });

  // Situation create
  mockPrisma.situation.create.mockResolvedValue({ id: "sit-new-001" });

  // Notification
  mockPrisma.notification.create.mockResolvedValue({ id: "notif-001" });

  // Worker dispatch
  mockEnqueueJob.mockResolvedValue("job-001");
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Billing gate: operator must be active for detection to proceed
  (prisma as any).operator.findUnique.mockResolvedValue({ billingStatus: "active", freeDetectionStartedAt: null, freeDetectionSituationCount: 0 });
});

describe("isEligibleCommunication", () => {
  it("accepts email, slack_message, teams_message", () => {
    expect(isEligibleCommunication({ sourceType: "email" })).toBe(true);
    expect(isEligibleCommunication({ sourceType: "slack_message" })).toBe(true);
    expect(isEligibleCommunication({ sourceType: "teams_message" })).toBe(true);
  });

  it("rejects drive_doc, calendar_note, uploaded_doc", () => {
    expect(isEligibleCommunication({ sourceType: "drive_doc" })).toBe(false);
    expect(isEligibleCommunication({ sourceType: "calendar_note" })).toBe(false);
    expect(isEligibleCommunication({ sourceType: "uploaded_doc" })).toBe(false);
  });

  it("rejects automated emails (test 9)", () => {
    expect(
      isEligibleCommunication({ sourceType: "email", metadata: { isAutomated: true } }),
    ).toBe(false);
  });

  it("accepts non-automated emails", () => {
    expect(
      isEligibleCommunication({ sourceType: "email", metadata: { isAutomated: false } }),
    ).toBe(true);
    expect(
      isEligibleCommunication({ sourceType: "email", metadata: {} }),
    ).toBe(true);
  });
});

describe("evaluateContentForSituations", () => {
  it("detects action-required email and creates situation (test 1)", async () => {
    setupStandardMocks();

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: "Prepare Q3 report by Friday",
          urgency: "high",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "Please prepare the Q3 report by Friday",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    // Should have called LLM
    expect(mockCallLLM).toHaveBeenCalledOnce();

    // Should create situation
    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.situation.create.mock.calls[0][0].data;
    expect(createArgs.source).toBe("content_detected");
    expect(createArgs.status).toBe("detected");
    expect(createArgs.confidence).toBe(0.9); // high urgency
    expect(createArgs.triggerEntityId).toBe("entity-alice");

    // Should create notification
    expect(sendNotificationToAdmins).toHaveBeenCalledOnce();

    // Should enqueue reasoning job for worker
    expect(mockEnqueueJob).toHaveBeenCalledWith("reason_situation", "op-1", { situationId: "sit-new-001" });
  });

  it("skips FYI emails that don't require action (test 2)", async () => {
    setupStandardMocks();

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: false,
          summary: "FYI meeting notes",
          urgency: "low",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [
      makeEmail({ content: "FYI — here are the meeting notes from today." }),
    ]);

    expect(mockCallLLM).toHaveBeenCalledOnce();
    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
  });

  it("skips sent emails entirely — no LLM call (test 3)", async () => {
    setupStandardMocks();

    await evaluateContentForSituations("op-1", [
      makeEmail({
        metadata: {
          direction: "sent",
          from: "alice@company.com",
          to: "client@external.com",
          subject: "Update",
          date: "2026-03-13T10:00:00Z",
        },
      }),
    ]);

    // No actors resolved (sent email → no actors), so no LLM call
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
  });

  it("deduplicates with existing open situation (test 4)", async () => {
    setupStandardMocks();

    // Alice has an existing open situation about Q3 report
    mockPrisma.situation.findMany.mockResolvedValue([
      {
        id: "sit-existing-q3",
        reasoning: JSON.stringify({ analysis: "Q3 report preparation needed by Friday deadline" }),
        contextSnapshot: null,
      },
    ]);
    mockPrisma.situation.findUnique.mockResolvedValue({
      contextSnapshot: JSON.stringify({ someKey: "value" }),
    });

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: "Follow-up on Q3 report deadline",
          urgency: "high",
          relatedSituationId: "sit-existing-q3",
          updatedSummary: "Q3 report still needed, follow-up received",
          evidence: "Just checking — is the Q3 report on track?",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [
      makeEmail({
        content: "Just checking — is the Q3 report on track?",
        metadata: {
          direction: "received",
          from: "boss@external.com",
          to: "alice@company.com",
          subject: "Re: Q3 Report",
          date: "2026-03-13T14:00:00Z",
        },
      }),
    ]);

    // Should update existing situation, not create new
    expect(mockPrisma.situation.update).toHaveBeenCalledOnce();
    const updateArgs = mockPrisma.situation.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("sit-existing-q3");

    const updatedSnapshot = JSON.parse(updateArgs.data.contextSnapshot);
    expect(updatedSnapshot.contentEvidence).toHaveLength(1);
    expect(updatedSnapshot.currentSummary).toBe("Q3 report still needed, follow-up received");

    // Should NOT create a new situation
    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
  });

  it("creates new situation for unrelated topic (test 5)", async () => {
    setupStandardMocks();

    // Alice has an existing open situation about Q3 report
    mockPrisma.situation.findMany.mockResolvedValue([
      {
        id: "sit-existing-q3",
        reasoning: JSON.stringify({ analysis: "Q3 report preparation" }),
        contextSnapshot: null,
      },
    ]);

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: "Update the client contact list",
          urgency: "medium",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "Please update the client list by end of day",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [
      makeEmail({
        content: "Please update the client list by end of day.",
        sourceId: "msg-002",
      }),
    ]);

    // Should create a new situation (not related to Q3 report)
    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    expect(mockPrisma.situation.update).not.toHaveBeenCalled();
  });

  it("non-org sender/recipient is skipped — no LLM call (test 7)", async () => {
    setupStandardMocks();

    // Override: nobody resolves
    mockResolveEntity.mockResolvedValue(null);

    await evaluateContentForSituations("op-1", [
      makeEmail({
        metadata: {
          direction: "received",
          from: "unknown@random.com",
          to: "nobody@unknown.com",
          subject: "Hello",
          date: "2026-03-13T10:00:00Z",
        },
        participantEmails: ["unknown@random.com", "nobody@unknown.com"],
      }),
    ]);

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
  });

  it("Slack author is excluded from actors (test 8)", async () => {
    setupStandardMocks();

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: "Review the deployment plan",
          urgency: "medium",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "Can you review the deployment plan?",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [
      {
        sourceType: "slack_message",
        sourceId: "slack-msg-001",
        content: "Can you review the deployment plan?",
        metadata: {
          authorEmail: "alice@company.com",
        },
        participantEmails: ["alice@company.com", "bob@company.com"],
      },
    ]);

    // Alice is author → excluded. Bob should be the actor.
    // resolveEntity should be called for bob but NOT for alice as actor
    const resolveArgs = mockResolveEntity.mock.calls.map(
      (c: [string, { identityValues?: { email?: string } }]) => c[1].identityValues?.email,
    );
    expect(resolveArgs).toContain("bob@company.com");
    expect(resolveArgs).not.toContain("alice@company.com");

    // Situation should be created for Bob
    if (mockPrisma.situation.create.mock.calls.length > 0) {
      expect(mockPrisma.situation.create.mock.calls[0][0].data.triggerEntityId).toBe("entity-bob");
    }
  });

  it("processes max 20 items and logs warning (test 10)", async () => {
    setupStandardMocks();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // No actors resolve → avoids LLM calls but tests the truncation
    mockResolveEntity.mockResolvedValue(null);

    const items: CommunicationItem[] = Array.from({ length: 25 }, (_, i) =>
      makeEmail({ sourceId: `msg-${i}` }),
    );

    await evaluateContentForSituations("op-1", items);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds limit of 20"),
    );
    consoleSpy.mockRestore();
  });
});

describe("3-category classification", () => {
  it("creates situation for action_required items", async () => {
    setupStandardMocks();
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([{
        messageIndex: 0,
        classification: "action_required",
        summary: "Prepare Q3 report by Friday",
        urgency: "high",
        confidence: 0.9,
        relatedSituationId: null,
        updatedSummary: null,
        evidence: "Please prepare the Q3 report by Friday",
        reasoning: "Direct task assignment with deadline",
      }]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    expect(mockPrisma.situation.create).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith("reason_situation", "op-1", expect.any(Object));
  });

  it("creates pre-resolved awareness situation for awareness items", async () => {
    setupStandardMocks();
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([{
        messageIndex: 0,
        classification: "awareness",
        summary: "Team standup notes shared",
        urgency: "low",
        confidence: 0.8,
        relatedSituationId: null,
        updatedSummary: null,
        evidence: "FYI — sharing standup notes",
        reasoning: "CC'd on informational email, no action requested",
      }]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    // Should create situation with status "resolved" and severity 0.1
    expect(mockPrisma.situation.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.situation.create.mock.calls[0][0].data;
    expect(createCall.status).toBe("resolved");
    expect(createCall.severity).toBe(0.1);
    // Should NOT enqueue reasoning — already resolved
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("does not create situation for irrelevant items", async () => {
    setupStandardMocks();
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([{
        messageIndex: 0,
        classification: "irrelevant",
        summary: "Casino promotion email",
        urgency: null,
        confidence: 0.95,
        relatedSituationId: null,
        updatedSummary: null,
        evidence: "Win big at CasinoLive!",
        reasoning: "Spam/promotional content unrelated to work",
      }]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    expect(mockPrisma.situation.create).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("logs ALL evaluations to EvaluationLog regardless of classification", async () => {
    setupStandardMocks();
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        { messageIndex: 0, classification: "irrelevant", summary: "Spam", urgency: null, confidence: 0.9, relatedSituationId: null, updatedSummary: null, evidence: "Buy now!", reasoning: "Spam" },
      ]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    expect((prisma as any).evaluationLog.create).toHaveBeenCalledTimes(1);
    const logData = (prisma as any).evaluationLog.create.mock.calls[0][0].data;
    expect(logData.classification).toBe("irrelevant");
    expect(logData.operatorId).toBe("op-1");
  });

  it("falls back to actionRequired boolean for backward compat", async () => {
    setupStandardMocks();
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([{
        messageIndex: 0,
        actionRequired: true,
        summary: "Task assigned",
        urgency: "medium",
        relatedSituationId: null,
        updatedSummary: null,
        evidence: "Please do this",
      }]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    // Should still create a situation via backward compat mapping
    expect(mockPrisma.situation.create).toHaveBeenCalledTimes(1);
  });
});

describe("ensureAwarenessType", () => {
  it("creates awareness situation type for department", async () => {
    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Finance" });
    mockPrisma.situationType.upsert.mockResolvedValue({ id: "st-awareness-finance" });

    const id = await ensureAwarenessType("op-awareness-test", "dept-finance-awareness");
    expect(id).toBe("st-awareness-finance");
    expect(mockPrisma.situationType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { operatorId_slug: { operatorId: "op-awareness-test", slug: "awareness-finance" } },
      }),
    );
  });
});

describe("ensureActionRequiredType", () => {
  it("creates on first call, returns cached on second (test 6)", async () => {
    // Use unique IDs to avoid pollution from earlier tests' cache
    mockPrisma.entity.findUnique.mockResolvedValue({
      displayName: "Marketing",
    });
    mockPrisma.situationType.upsert.mockResolvedValue({
      id: "sit-type-marketing",
    });

    const id1 = await ensureActionRequiredType("op-cache-test", "dept-marketing");
    expect(id1).toBe("sit-type-marketing");
    expect(mockPrisma.situationType.upsert).toHaveBeenCalledOnce();

    // Second call should use cache
    const id2 = await ensureActionRequiredType("op-cache-test", "dept-marketing");
    expect(id2).toBe("sit-type-marketing");
    // Still only 1 upsert call — cached
    expect(mockPrisma.situationType.upsert).toHaveBeenCalledOnce();
  });
});
