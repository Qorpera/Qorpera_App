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
import {
  evaluateContentForSituations,
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
  evaluationLog: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;
const mockResolveEntity = resolveEntity as ReturnType<typeof vi.fn>;
const mockResolveDepts = resolveDepartmentsFromEmails as ReturnType<typeof vi.fn>;

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
  mockResolveEntity.mockImplementation(async (_opId: string, hints: { identityValues?: { email?: string } }) => {
    const email = hints.identityValues?.email;
    if (email === "alice@company.com") return "entity-alice";
    return null;
  });

  mockPrisma.entity.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "entity-alice")
      return {
        displayName: "Alice Smith",
        propertyValues: [{ value: "Analyst", property: { slug: "job-title" } }],
      };
    if (where.id === "dept-finance")
      return { displayName: "Finance & Operations" };
    return null;
  });

  mockResolveDepts.mockResolvedValue(["dept-finance"]);
  mockPrisma.situation.findMany.mockResolvedValue([]);
  mockPrisma.situationType.upsert.mockResolvedValue({ id: "sit-type-action-req" });
  mockPrisma.situation.create.mockResolvedValue({ id: "sit-new-001" });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (prisma as any).operator.findUnique.mockResolvedValue({ billingStatus: "active", freeDetectionStartedAt: null, freeDetectionSituationCount: 0 });
});

describe("trigger evidence — content detection", () => {
  it("handleActionRequired creates situation with triggerEvidence containing raw content", async () => {
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
          reasoning: "Explicit deadline request from manager",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.situation.create.mock.calls[0][0].data;

    // triggerEvidence should be present and parseable
    expect(createArgs.triggerEvidence).toBeDefined();
    const evidence = JSON.parse(createArgs.triggerEvidence);
    expect(evidence.type).toBe("content");
    expect(evidence.sourceType).toBe("email");
    expect(evidence.sender).toBe("boss@external.com");
    expect(evidence.subject).toBe("Q3 Report");
    expect(evidence.content).toBe("Please prepare the Q3 report by Friday.");
    expect(evidence.summary).toBe("Prepare Q3 report by Friday");
    expect(evidence.reasoning).toBe("Explicit deadline request from manager");
    expect(evidence.urgency).toBe("high");

    // triggerSummary should be present
    expect(createArgs.triggerSummary).toBeDefined();
    expect(createArgs.triggerSummary).toContain("boss");
    expect(createArgs.triggerSummary).toContain("Q3 Report");
    expect(createArgs.triggerSummary).toContain("Prepare Q3 report by Friday");
  });

  it("handleAwareness creates situation with triggerEvidence", async () => {
    setupStandardMocks();

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: false,
          summary: "Team lunch scheduled for next week",
          urgency: "low",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "",
          classification: "awareness",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [
      makeEmail({ content: "Just a heads up — team lunch next Wednesday at noon." }),
    ]);

    // Awareness creates a resolved situation
    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.situation.create.mock.calls[0][0].data;

    expect(createArgs.triggerEvidence).toBeDefined();
    const evidence = JSON.parse(createArgs.triggerEvidence);
    expect(evidence.type).toBe("content");
    expect(evidence.classification).toBe("awareness");

    expect(createArgs.triggerSummary).toBeDefined();
    expect(createArgs.triggerSummary).toContain("Team lunch");
  });

  it("triggerSummary is truncated to 300 characters", async () => {
    setupStandardMocks();

    const longSummary = "A".repeat(400);

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: longSummary,
          urgency: "medium",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "long evidence",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [makeEmail()]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.situation.create.mock.calls[0][0].data;
    expect(createArgs.triggerSummary.length).toBeLessThanOrEqual(300);
  });

  it("triggerEvidence.content is truncated to 2000 characters", async () => {
    setupStandardMocks();

    const longContent = "B".repeat(3000);

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        {
          messageIndex: 0,
          actionRequired: true,
          summary: "Important request",
          urgency: "high",
          relatedSituationId: null,
          updatedSummary: null,
          evidence: "evidence",
        },
      ]),
    });

    await evaluateContentForSituations("op-1", [makeEmail({ content: longContent })]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.situation.create.mock.calls[0][0].data;
    const evidence = JSON.parse(createArgs.triggerEvidence);
    expect(evidence.content.length).toBeLessThanOrEqual(2000);
  });
});
