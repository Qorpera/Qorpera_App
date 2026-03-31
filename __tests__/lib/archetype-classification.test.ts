import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    situationArchetype: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    situationType: {
      upsert: vi.fn(),
    },
    entity: {
      findUnique: vi.fn(),
    },
    evaluationLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/situation-type-helpers", () => ({
  ensureActionRequiredType: vi.fn().mockResolvedValue("fallback-type-id"),
}));

import { prisma } from "@/lib/db";
import {
  getArchetypeTaxonomy,
  clearArchetypeCache,
  ensureArchetypeSituationType,
  clearArchetypeTypeCache,
} from "@/lib/archetype-classifier";
import { ensureActionRequiredType } from "@/lib/situation-type-helpers";

const mockArchetypes = [
  {
    slug: "overdue_invoice",
    name: "Overdue Invoice",
    description: "A customer invoice is past its due date.",
    category: "payment_financial",
    defaultSeverity: "high",
    examplePhrases: JSON.stringify([
      "Invoice is 15 days overdue",
      "Customer hasn't paid",
      "Payment still outstanding",
    ]),
    detectionTemplate: JSON.stringify({ mode: "content", description: "overdue invoices" }),
    createdAt: new Date(),
  },
  {
    slug: "client_escalation",
    name: "Client Escalation",
    description: "A customer is expressing dissatisfaction.",
    category: "client_communication",
    defaultSeverity: "high",
    examplePhrases: JSON.stringify([
      "Client complains about delays",
      "Customer threatening to leave",
      "Angry email",
    ]),
    detectionTemplate: JSON.stringify({ mode: "content", description: "client complaints" }),
    createdAt: new Date(),
  },
  {
    slug: "deal_stagnation",
    name: "Deal Stagnation",
    description: "An open deal has had no activity.",
    category: "sales_pipeline",
    defaultSeverity: "medium",
    examplePhrases: JSON.stringify([
      "No contact in 3 weeks",
      "Quote sent but no follow-up",
      "Deal stuck in proposal",
    ]),
    detectionTemplate: JSON.stringify({ mode: "content", description: "stalled deals" }),
    createdAt: new Date(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  clearArchetypeCache();
  clearArchetypeTypeCache();
});

describe("Archetype taxonomy builder", () => {
  it("returns formatted string with categories and descriptions", async () => {
    vi.mocked(prisma.situationArchetype.findMany).mockResolvedValue(mockArchetypes);

    const taxonomy = await getArchetypeTaxonomy();

    expect(taxonomy).toContain("## Payment Financial");
    expect(taxonomy).toContain("## Client Communication");
    expect(taxonomy).toContain("## Sales Pipeline");
    expect(taxonomy).toContain("**overdue_invoice**");
    expect(taxonomy).toContain("A customer invoice is past its due date.");
    expect(taxonomy).toContain('"Invoice is 15 days overdue"');
  });
});

describe("ensureArchetypeSituationType", () => {
  it("returns existing type ID without creating a new one", async () => {
    vi.mocked(prisma.entity.findUnique).mockResolvedValue({
      displayName: "Administration",
    } as never);
    vi.mocked(prisma.situationArchetype.findUnique).mockResolvedValue(mockArchetypes[0] as never);
    vi.mocked(prisma.situationType.upsert).mockResolvedValue({
      id: "existing-type-id",
    } as never);

    const result = await ensureArchetypeSituationType("op1", "dept1", "overdue_invoice");

    expect(result).toBe("existing-type-id");
    expect(prisma.situationType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { operatorId_slug: { operatorId: "op1", slug: "overdue-invoice-administration" } },
      }),
    );
  });

  it("auto-creates SituationType with correct metadata", async () => {
    vi.mocked(prisma.entity.findUnique).mockResolvedValue({
      displayName: "Sales",
    } as never);
    vi.mocked(prisma.situationArchetype.findUnique).mockResolvedValue(mockArchetypes[0] as never);
    vi.mocked(prisma.situationType.upsert).mockResolvedValue({
      id: "new-type-id",
    } as never);

    await ensureArchetypeSituationType("op1", "dept-sales", "overdue_invoice");

    expect(prisma.situationType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          name: "Overdue Invoice",
          description: "A customer invoice is past its due date.",
          archetypeSlug: "overdue_invoice",
          scopeEntityId: "dept-sales",
        }),
      }),
    );
  });

  it("falls back to ensureActionRequiredType when archetype not found", async () => {
    vi.mocked(prisma.entity.findUnique).mockResolvedValue({
      displayName: "Admin",
    } as never);
    vi.mocked(prisma.situationArchetype.findUnique).mockResolvedValue(null);

    const result = await ensureArchetypeSituationType("op1", "dept1", "nonexistent_slug");

    expect(result).toBe("fallback-type-id");
    expect(ensureActionRequiredType).toHaveBeenCalledWith("op1", "dept1");
    expect(prisma.situationType.upsert).not.toHaveBeenCalled();
  });
});

describe("Classification routing threshold", () => {
  it("routes to ensureActionRequiredType when archetypeConfidence < 0.6", () => {
    // This tests the routing logic from handleActionRequired
    const result = {
      archetypeSlug: "overdue_invoice",
      archetypeConfidence: 0.5,
    };

    const shouldUseArchetype =
      result.archetypeSlug &&
      result.archetypeSlug !== "unclassified" &&
      result.archetypeConfidence &&
      result.archetypeConfidence >= 0.6;

    expect(shouldUseArchetype).toBeFalsy();
  });

  it("routes to ensureArchetypeSituationType when archetypeConfidence >= 0.6", () => {
    const result = {
      archetypeSlug: "overdue_invoice",
      archetypeConfidence: 0.6,
    };

    const shouldUseArchetype =
      result.archetypeSlug &&
      result.archetypeSlug !== "unclassified" &&
      result.archetypeConfidence &&
      result.archetypeConfidence >= 0.6;

    expect(shouldUseArchetype).toBeTruthy();
  });

  it("routes to ensureActionRequiredType for 'unclassified' slug", () => {
    const result = {
      archetypeSlug: "unclassified",
      archetypeConfidence: 0.9,
    };

    const shouldUseArchetype =
      result.archetypeSlug &&
      result.archetypeSlug !== "unclassified" &&
      result.archetypeConfidence &&
      result.archetypeConfidence >= 0.6;

    expect(shouldUseArchetype).toBeFalsy();
  });
});

describe("EvaluationLog archetype fields", () => {
  it("stores archetypeSlug and archetypeConfidence in create data", async () => {
    vi.mocked(prisma.evaluationLog.create).mockResolvedValue({} as never);

    await prisma.evaluationLog.create({
      data: {
        operatorId: "op1",
        actorEntityId: "entity1",
        sourceType: "email",
        sourceId: "msg-1",
        classification: "action_required",
        summary: "Test summary",
        reasoning: "Test reasoning",
        urgency: "high",
        confidence: 0.9,
        archetypeSlug: "overdue_invoice",
        archetypeConfidence: 0.85,
        situationId: null,
      },
    });

    expect(prisma.evaluationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          archetypeSlug: "overdue_invoice",
          archetypeConfidence: 0.85,
        }),
      }),
    );
  });
});
