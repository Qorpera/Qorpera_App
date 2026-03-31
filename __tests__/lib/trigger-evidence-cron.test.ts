import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
    },
    situation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    situationType: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    situationEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    operator: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([]),
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
  },
}));

vi.mock("@/lib/entity-resolution", () => ({
  getEntityContext: vi.fn(),
}));

vi.mock("@/lib/context-assembly", () => ({
  assembleSituationContext: vi.fn(),
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/worker-dispatch", () => ({
  enqueueWorkerJob: vi.fn().mockResolvedValue("job-001"),
}));

vi.mock("@/lib/situation-scope", () => ({
  isEntityInScope: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/json-helpers", () => ({
  extractJSONArray: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
}));

vi.mock("@/lib/confirmation-rate", () => ({
  checkConfirmationRate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";
import { assembleSituationContext } from "@/lib/context-assembly";
import { callLLM } from "@/lib/ai-provider";
import { notifySituationDetectors } from "@/lib/situation-detector";
import type { SituationContext } from "@/lib/context-assembly";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  entity: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  entityType: { findFirst: ReturnType<typeof vi.fn> };
  situation: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  situationType: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  operator: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

const mockGetEntityContext = getEntityContext as ReturnType<typeof vi.fn>;
const mockAssembleContext = assembleSituationContext as ReturnType<typeof vi.fn>;
const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const FAKE_CONTEXT: SituationContext = {
  triggerEntity: {
    id: "entity-001",
    type: "contact",
    typeSlug: "contact",
    displayName: "Acme Corp",
    category: "external",
    properties: { status: "overdue", amount: "5000", industry: "tech", secret_field: "sensitive" },
  },
  departments: [],
  departmentKnowledge: [],
  relatedEntities: { base: [], digital: [], external: [] },
  recentEvents: [],
  priorSituations: [],
  activityTimeline: [],
  communicationContext: [],
  crossDepartmentSignals: [],
};

function setupStructuredDetection() {
  // Entity exists with entityType (used by notifySituationDetectors)
  mockPrisma.entity.findUnique.mockResolvedValue({
    id: "entity-001",
    displayName: "Acme Corp",
    entityType: { slug: "contact" },
    propertyValues: [
      { value: "overdue", property: { slug: "status" } },
      { value: "5000", property: { slug: "amount" } },
      { value: "tech", property: { slug: "industry" } },
      { value: "sensitive", property: { slug: "secret_field" } },
    ],
  });

  // getEntityContext (used by detectSituationsForEntity to build candidate)
  mockGetEntityContext.mockResolvedValue({
    id: "entity-001",
    displayName: "Acme Corp",
    typeName: "contact",
    properties: { status: "overdue", amount: "5000", industry: "tech", secret_field: "sensitive" },
    relationships: [],
  });

  // SituationType with structured detection
  mockPrisma.situationType.findMany.mockResolvedValue([
    {
      id: "st-001",
      slug: "overdue-invoice",
      name: "Overdue Invoice",
      description: "Invoice is overdue",
      detectionLogic: JSON.stringify({
        mode: "structured",
        structured: {
          entityType: "contact",
          signals: [
            { field: "status", condition: "equals", value: "overdue" },
            { field: "amount", condition: "greater_than", threshold: 1000 },
          ],
        },
      }),
      preFilterPassCount: 0,
      llmConfirmCount: 0,
      scopeEntityId: null,
      scopeDepth: null,
    },
  ]);

  // No existing situations
  mockPrisma.situation.findFirst.mockResolvedValue(null);

  // Situation create
  mockPrisma.situation.create.mockResolvedValue({ id: "sit-001" });

  // Context assembly
  mockAssembleContext.mockResolvedValue(FAKE_CONTEXT);

  // Billing gate
  mockPrisma.operator.findUnique.mockResolvedValue({ billingStatus: "active", freeDetectionStartedAt: null, freeDetectionSituationCount: 0 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trigger evidence — cron/entity detection", () => {
  it("structured detection produces triggerEvidence with matchedSignals and filtered matchedValues", async () => {
    setupStructuredDetection();

    await notifySituationDetectors("op-1", ["entity-001"]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const data = mockPrisma.situation.create.mock.calls[0][0].data;

    expect(data.triggerEvidence).toBeDefined();
    const evidence = JSON.parse(data.triggerEvidence);
    expect(evidence.type).toBe("structured");
    expect(evidence.matchedSignals).toHaveLength(2);
    expect(evidence.matchedSignals[0].field).toBe("status");
    expect(evidence.matchedSignals[1].field).toBe("amount");
    expect(evidence.entityName).toBe("Acme Corp");

    // matchedValues should only contain signal fields, NOT all properties
    expect(evidence.matchedValues).toHaveProperty("status");
    expect(evidence.matchedValues).toHaveProperty("amount");
    expect(evidence.matchedValues).not.toHaveProperty("industry");
    expect(evidence.matchedValues).not.toHaveProperty("secret_field");

    // triggerSummary should contain entity name and signal descriptions
    expect(data.triggerSummary).toBeDefined();
    expect(data.triggerSummary).toContain("Acme Corp");
    expect(data.triggerSummary).toContain("status");
  });

  it("natural mode detection produces triggerEvidence with reasoning", async () => {
    setupStructuredDetection();

    // Override to natural detection
    mockPrisma.situationType.findMany.mockResolvedValue([
      {
        id: "st-002",
        slug: "churn-risk",
        name: "Churn Risk",
        description: "Customer showing signs of churn",
        detectionLogic: JSON.stringify({
          mode: "natural",
          naturalLanguage: "Customer showing signs of disengagement or churn",
        }),
        preFilterPassCount: 0,
        llmConfirmCount: 0,
        scopeEntityId: null,
        scopeDepth: null,
      },
    ]);

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        { matches: true, confidence: 0.85, reasoning: "Customer has not engaged in 30 days and revenue is declining" },
      ]),
    });

    await notifySituationDetectors("op-1", ["entity-001"]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const data = mockPrisma.situation.create.mock.calls[0][0].data;

    expect(data.triggerEvidence).toBeDefined();
    const evidence = JSON.parse(data.triggerEvidence);
    expect(evidence.type).toBe("natural");
    expect(evidence.reasoning).toBe("Customer has not engaged in 30 days and revenue is declining");
    expect(evidence.entityName).toBe("Acme Corp");

    // triggerSummary should start with the reasoning
    expect(data.triggerSummary).toBeDefined();
    expect(data.triggerSummary).toContain("Customer has not engaged");
  });

  it("hybrid detection produces triggerEvidence with both signals and reasoning", async () => {
    setupStructuredDetection();

    // Override to hybrid detection
    mockPrisma.situationType.findMany.mockResolvedValue([
      {
        id: "st-003",
        slug: "high-value-overdue",
        name: "High-Value Overdue",
        description: "High-value invoice overdue with churn risk",
        detectionLogic: JSON.stringify({
          mode: "hybrid",
          structured: {
            entityType: "contact",
            signals: [
              { field: "status", condition: "equals", value: "overdue" },
            ],
          },
          naturalLanguage: "Overdue invoice with high churn risk",
        }),
        preFilterPassCount: 0,
        llmConfirmCount: 0,
        scopeEntityId: null,
        scopeDepth: null,
      },
    ]);

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify([
        { matches: true, confidence: 0.9, reasoning: "Overdue invoice confirmed with signs of disengagement" },
      ]),
    });

    await notifySituationDetectors("op-1", ["entity-001"]);

    expect(mockPrisma.situation.create).toHaveBeenCalledOnce();
    const data = mockPrisma.situation.create.mock.calls[0][0].data;

    expect(data.triggerEvidence).toBeDefined();
    const evidence = JSON.parse(data.triggerEvidence);
    expect(evidence.type).toBe("hybrid");
    expect(evidence.matchedSignals).toHaveLength(1);
    expect(evidence.llmReasoning).toBe("Overdue invoice confirmed with signs of disengagement");
    expect(evidence.entityName).toBe("Acme Corp");

    // matchedValues filtered to signal fields only
    expect(evidence.matchedValues).toHaveProperty("status");
    expect(evidence.matchedValues).not.toHaveProperty("industry");

    expect(data.triggerSummary).toBeDefined();
  });
});
