import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    onboardingAgentRun: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    entity: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    entityProperty: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    propertyValue: {
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    relationshipType: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    relationship: {
      upsert: vi.fn(),
    },
    situationType: {
      upsert: vi.fn(),
    },
    user: { findMany: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/internal-api", () => ({
  triggerNextIteration: vi.fn().mockResolvedValue(undefined),
  getBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/hardcoded-type-defs", () => ({
  HARDCODED_TYPE_DEFS: {
    department: {
      slug: "department",
      name: "Department",
      description: "Organizational department",
      properties: [],
    },
    "team-member": {
      slug: "team-member",
      name: "Team Member",
      description: "Person in the org",
      properties: [
        { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
        { slug: "role", name: "Role", dataType: "STRING" },
      ],
    },
  },
  CATEGORY_PRIORITY: { foundational: 5, base: 4, internal: 3, digital: 2, external: 1 },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const mockPrisma = prisma as any;
const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYNTHESIS
// ═══════════════════════════════════════════════════════════════════════════════

const mockCompanyModel = {
  departments: [
    { name: "Sales", description: "Sales team", confidence: "high" },
    { name: "Engineering", description: "Product dev", confidence: "medium" },
  ],
  people: [
    { email: "alice@co.dk", displayName: "Alice", primaryDepartment: "Sales", role: "Account Manager", roleLevel: "ic" },
    { email: "bob@co.dk", displayName: "Bob", primaryDepartment: "Engineering", role: "Developer", roleLevel: "ic", reportsToEmail: "cto@co.dk" },
    { email: "cto@co.dk", displayName: "CTO", primaryDepartment: "Engineering", role: "CTO", roleLevel: "c_level" },
  ],
  crossFunctionalPeople: [],
  processes: [],
  keyRelationships: [],
  financialSnapshot: { currency: "DKK", revenueTrend: "stable", overdueInvoiceCount: 0, dataCompleteness: "partial" },
  situationTypeRecommendations: [
    { name: "Invoice Overdue", description: "Detect overdue invoices", detectionLogic: "Invoice past due > 30 days", department: "Sales", severity: "high", expectedFrequency: "weekly" },
  ],
  uncertaintyLog: [
    { question: "Does Bob report to CTO or VP Engineering?", context: "Calendar data ambiguous" },
  ],
};

describe("Synthesis", () => {
  it("launchSynthesis creates entities from model and marks analysis confirming", async () => {
    // Setup mocks
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "synth-run" });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({
      id: "a1",
      operatorId: "op1",
      operator: { id: "op1" },
    });
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { agentName: "org_analyst", round: 1, report: {}, status: "complete" },
    ]);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({});

    // Entity creation mocks
    mockPrisma.entityType.findFirst.mockResolvedValue({ id: "dept-type" });
    mockPrisma.entity.findFirst.mockResolvedValue(null); // No existing entities
    mockPrisma.entity.create.mockImplementation(() => ({
      id: `e-${Math.random().toString(36).slice(2, 8)}`,
      entityTypeId: "dept-type",
      parentDepartmentId: null,
    }));
    mockPrisma.entityProperty.findFirst.mockResolvedValue({ id: "email-prop" });
    mockPrisma.propertyValue.findFirst.mockResolvedValue(null);
    mockPrisma.propertyValue.create.mockResolvedValue({});
    mockPrisma.propertyValue.upsert.mockResolvedValue({});
    mockPrisma.relationshipType.findFirst.mockResolvedValue({ id: "dept-member-type" });
    mockPrisma.relationship.upsert.mockResolvedValue({});
    mockPrisma.situationType.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);

    // LLM returns valid company model
    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify(mockCompanyModel),
      usage: { inputTokens: 5000, outputTokens: 2000 },
      apiCostCents: 20,
    });

    const { launchSynthesis } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await launchSynthesis("a1");

    // Should create synthesis run
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentName: "synthesis", round: 99 }),
      }),
    );

    // Should mark analysis as confirming
    const analysisUpdate = mockPrisma.onboardingAnalysis.update.mock.calls.find(
      (c: any) => c[0]?.data?.status === "confirming",
    );
    expect(analysisUpdate).toBeTruthy();

    // Should have called entity creation (departments + people)
    expect(mockPrisma.entity.create).toHaveBeenCalled();

    // Should create situation types
    expect(mockPrisma.situationType.upsert).toHaveBeenCalled();
    const stCall = mockPrisma.situationType.upsert.mock.calls[0][0];
    expect(stCall.create.name).toBe("Invoice Overdue");
    expect(stCall.create.autonomyLevel).toBe("supervised");

    // Should send notification
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        type: "system_alert",
      }),
    );
  });

  it("synthesis failure marks analysis as failed", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "synth-run" });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({
      id: "a1",
      operatorId: "op1",
      operator: { id: "op1" },
    });
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([]);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    mockCallLLM.mockRejectedValueOnce(new Error("LLM quota exceeded"));

    const { launchSynthesis } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await launchSynthesis("a1");

    // Should mark analysis as failed
    const failUpdate = mockPrisma.onboardingAnalysis.update.mock.calls.find(
      (c: any) => c[0]?.data?.status === "failed",
    );
    expect(failUpdate).toBeTruthy();
    expect(failUpdate[0].data.failureReason).toContain("LLM quota exceeded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Entity Creation", () => {
  it("creates departments as foundational entities", async () => {
    mockPrisma.entityType.findFirst.mockResolvedValue({ id: "dept-type" });
    mockPrisma.entity.findFirst.mockResolvedValue(null);
    mockPrisma.entity.create.mockImplementation(() => ({ id: "new-dept", entityTypeId: "dept-type", parentDepartmentId: null }));
    mockPrisma.entityProperty.findFirst.mockResolvedValue({ id: "email-prop" });
    mockPrisma.propertyValue.findFirst.mockResolvedValue(null);
    mockPrisma.propertyValue.create.mockResolvedValue({});
    mockPrisma.propertyValue.upsert.mockResolvedValue({});
    mockPrisma.relationshipType.findFirst.mockResolvedValue({ id: "rel-type" });
    mockPrisma.relationship.upsert.mockResolvedValue({});

    const { createEntitiesFromModel } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await createEntitiesFromModel("op1", mockCompanyModel as any);

    // Should create 2 departments + 3 people = 5 entity creates
    const createCalls = mockPrisma.entity.create.mock.calls;
    expect(createCalls.length).toBe(5);

    // First two should be departments
    expect(createCalls[0][0].data.category).toBe("foundational");
    expect(createCalls[0][0].data.displayName).toBe("Sales");
    expect(createCalls[1][0].data.category).toBe("foundational");
    expect(createCalls[1][0].data.displayName).toBe("Engineering");
  });

  it("idempotent: existing entities are not duplicated", async () => {
    mockPrisma.entityType.findFirst.mockResolvedValue({ id: "dept-type" });
    // Departments already exist
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "existing-dept", entityTypeId: "dept-type", parentDepartmentId: null });
    // People already exist (found by email)
    mockPrisma.propertyValue.findFirst.mockResolvedValue({
      entity: { id: "existing-person", entityTypeId: "dept-type", parentDepartmentId: "existing-dept" },
    });
    mockPrisma.entityProperty.findFirst.mockResolvedValue({ id: "role-prop" });
    mockPrisma.propertyValue.upsert.mockResolvedValue({});
    mockPrisma.relationshipType.findFirst.mockResolvedValue({ id: "rel-type" });
    mockPrisma.relationship.upsert.mockResolvedValue({});

    const { createEntitiesFromModel } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await createEntitiesFromModel("op1", mockCompanyModel as any);

    // Should NOT create any new entities (all exist)
    expect(mockPrisma.entity.create).not.toHaveBeenCalled();
  });

  it("creates reporting relationships", async () => {
    mockPrisma.entityType.findFirst.mockResolvedValue({ id: "dept-type" });
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "dept-e", entityTypeId: "dept-type", parentDepartmentId: null });
    // findEntityByEmail returns different entities for different emails
    mockPrisma.propertyValue.findFirst.mockImplementation((args: any) => {
      const email = args.where.value;
      return {
        entity: { id: `e-${email}`, entityTypeId: "dept-type", parentDepartmentId: "dept-e" },
      };
    });
    mockPrisma.entityProperty.findFirst.mockResolvedValue({ id: "role-prop" });
    mockPrisma.propertyValue.upsert.mockResolvedValue({});
    mockPrisma.relationshipType.findFirst.mockResolvedValue({ id: "reports-to-type" });
    mockPrisma.relationship.upsert.mockResolvedValue({});

    const { createEntitiesFromModel } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await createEntitiesFromModel("op1", mockCompanyModel as any);

    // Bob reports to CTO → should create reports-to relationship
    const relUpserts = mockPrisma.relationship.upsert.mock.calls;
    const reportsToCall = relUpserts.find(
      (c: any) => c[0].where.relationshipTypeId_fromEntityId_toEntityId.relationshipTypeId === "reports-to-type"
        && c[0].where.relationshipTypeId_fromEntityId_toEntityId.fromEntityId === "e-bob@co.dk",
    );
    expect(reportsToCall).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SITUATION TYPE CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Situation Type Creation", () => {
  it("creates situation types with correct slugs at supervised autonomy", async () => {
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "sales-dept" });
    mockPrisma.situationType.upsert.mockResolvedValue({});

    const { createSituationTypesFromModel } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await createSituationTypesFromModel("op1", mockCompanyModel as any);

    const call = mockPrisma.situationType.upsert.mock.calls[0][0];
    expect(call.where.operatorId_slug.slug).toBe("invoice-overdue");
    expect(call.create.autonomyLevel).toBe("supervised");
    expect(call.create.scopeEntityId).toBe("sales-dept");
    expect(call.create.detectionLogic).toContain("natural");
  });

  it("upsert: existing types updated, not duplicated", async () => {
    mockPrisma.entity.findFirst.mockResolvedValue(null);
    mockPrisma.situationType.upsert.mockResolvedValue({});

    const { createSituationTypesFromModel } = await import(
      "@/lib/onboarding-intelligence/synthesis"
    );
    await createSituationTypesFromModel("op1", mockCompanyModel as any);

    // Should use upsert (not create)
    expect(mockPrisma.situationType.upsert).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRM STRUCTURE ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

describe("Confirm Structure Endpoint", () => {
  it("marks analysis as complete and triggers detection", async () => {
    const { getSessionUser } = await import("@/lib/auth");
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({});

    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;

    const { POST } = await import(
      "@/app/api/onboarding/confirm-structure/route"
    );
    const req = new Request("http://localhost/api/onboarding/confirm-structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Should mark analysis complete
    expect(mockPrisma.onboardingAnalysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "complete" },
      }),
    );

    globalThis.fetch = originalFetch;
  });
});
