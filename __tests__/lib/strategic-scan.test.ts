import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    situation: {
      findMany: vi.fn(),
    },
    situationType: {
      findMany: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    initiative: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    activitySignal: {
      count: vi.fn(),
    },
    operator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRelevantContext: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/json-helpers", () => ({
  extractJSON: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import {
  runStrategicScan,
  selectDepartmentForAudit,
  loadDepartmentAuditContext,
  createInitiativeFromScan,
  type ScanResult,
} from "@/lib/strategic-scan";

const mockPrisma = prisma as any;
const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── selectDepartmentForAudit ─────────────────────────────────────────────────

describe("selectDepartmentForAudit", () => {
  it("returns a department when departments exist", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "dept-1", displayName: "Sales" },
      { id: "dept-2", displayName: "Engineering" },
    ]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const result = await selectDepartmentForAudit("op-1");
    expect(result).not.toBeNull();
    expect(["dept-1", "dept-2"]).toContain(result!.id);
  });

  it("returns null when no departments exist", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([]);

    const result = await selectDepartmentForAudit("op-1");
    expect(result).toBeNull();
  });

  it("prefers departments not recently scanned", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "dept-1", displayName: "Sales" },
      { id: "dept-2", displayName: "Engineering" },
    ]);
    // dept-1 was recently scanned
    mockPrisma.initiative.findMany.mockResolvedValue([
      { rationale: "[strategic-scan:department_audit] [dept:dept-1] Some finding", createdAt: new Date() },
    ]);

    const result = await selectDepartmentForAudit("op-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("dept-2"); // should prefer unscanned
  });
});

// ── loadDepartmentAuditContext ────────────────────────────────────────────────

describe("loadDepartmentAuditContext", () => {
  it("returns populated context with all sections", async () => {
    // entity.findMany calls in order: 1) members, 2) openSitEntities, 3) resolvedSitEntities, 4) crossDept
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([{
        id: "person-1",
        displayName: "Alice",
        propertyValues: [
          { value: "Engineer", property: { slug: "role" } },
          { value: "alice@co.com", property: { slug: "email" } },
        ],
      }])
      .mockResolvedValueOnce([]) // open situation entity names
      .mockResolvedValueOnce([]) // resolved situation entity names
      .mockResolvedValueOnce([{ id: "dept-other", displayName: "Marketing" }]); // cross-dept

    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Engineering", description: "Builds the product" });
    mockPrisma.situation.findMany.mockResolvedValue([]);
    mockPrisma.situationType.findMany.mockResolvedValue([
      { name: "Build Failure", description: "CI build failure detected", detectedCount: 5, confirmedCount: 3 },
    ]);
    mockPrisma.goal.findMany
      .mockResolvedValueOnce([{ title: "Ship v2", description: "Release v2", measurableTarget: "Q2 launch", priority: 1, deadline: null }])
      .mockResolvedValueOnce([]); // HQ goals
    mockPrisma.activitySignal.count
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(15);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const ctx = await loadDepartmentAuditContext("op-1", "dept-eng", "Engineering");

    expect(ctx.department.name).toBe("Engineering");
    expect(ctx.department.description).toBe("Builds the product");
    expect(ctx.department.memberCount).toBe(1);
    expect(ctx.department.members[0].name).toBe("Alice");
    expect(ctx.department.members[0].role).toBe("Engineer");
    expect(ctx.situationTypes).toHaveLength(1);
    expect(ctx.goals).toHaveLength(1);
    expect(ctx.communicationPatterns.emailVolumeLast30Days).toBe(120);
    expect(ctx.communicationPatterns.meetingCountLast30Days).toBe(15);
  });
});

// ── createInitiativeFromScan ─────────────────────────────────────────────────

describe("createInitiativeFromScan", () => {
  const baseScanResult: ScanResult = {
    title: "Knowledge concentration risk",
    description: "Alice holds all critical knowledge",
    rationale: "If Alice leaves, the team loses institutional knowledge",
    impactAssessment: "Reduced bus factor risk",
    departmentId: "dept-eng",
    urgency: "medium",
    confidence: 0.8,
    approach: "department_audit",
    evidence: [{ type: "structural", summary: "Single person handles all deploys" }],
  };

  it("creates an initiative with correct rationale format", async () => {
    // Existing goal found
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1" });
    // AI entity found
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-dept-eng" });
    // No existing initiative (dedup passes)
    mockPrisma.initiative.findFirst.mockResolvedValue(null);
    mockPrisma.initiative.create.mockResolvedValue({ id: "init-1" });

    const created = await createInitiativeFromScan("op-1", baseScanResult);

    expect(created).toBe(true);
    expect(mockPrisma.initiative.create).toHaveBeenCalledOnce();
    const data = mockPrisma.initiative.create.mock.calls[0][0].data;
    expect(data.goalId).toBe("goal-1");
    expect(data.aiEntityId).toBe("ai-dept-eng");
    expect(data.status).toBe("proposed");
    expect(data.rationale).toContain("[strategic-scan:department_audit]");
    expect(data.rationale).toContain("[dept:dept-eng]");
    expect(data.rationale).toContain("Knowledge concentration risk");
  });

  it("deduplicates initiatives with same title", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1" });
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-dept-eng" });
    // Existing initiative found
    mockPrisma.initiative.findFirst.mockResolvedValue({ id: "existing-init" });

    const created = await createInitiativeFromScan("op-1", baseScanResult);

    expect(created).toBe(false);
    expect(mockPrisma.initiative.create).not.toHaveBeenCalled();
  });

  it("skips when no AI entity found", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1" });
    mockPrisma.entity.findFirst.mockResolvedValue(null); // no AI entity
    mockPrisma.initiative.findFirst.mockResolvedValue(null);

    const created = await createInitiativeFromScan("op-1", baseScanResult);

    expect(created).toBe(false);
    expect(mockPrisma.initiative.create).not.toHaveBeenCalled();
  });

  it("creates a catch-all goal when none exists", async () => {
    // No existing goal
    mockPrisma.goal.findFirst.mockResolvedValue(null);
    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Engineering" });
    mockPrisma.goal.create.mockResolvedValue({ id: "new-goal-1" });
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-dept-eng" });
    mockPrisma.initiative.findFirst.mockResolvedValue(null);
    mockPrisma.initiative.create.mockResolvedValue({ id: "init-1" });

    const created = await createInitiativeFromScan("op-1", baseScanResult);

    expect(created).toBe(true);
    expect(mockPrisma.goal.create).toHaveBeenCalledOnce();
    const goalData = mockPrisma.goal.create.mock.calls[0][0].data;
    expect(goalData.title).toContain("Improve Engineering operations");
    expect(goalData.source).toBe("strategic-scan");
  });
});

// ── runStrategicScan (integration) ───────────────────────────────────────────

describe("runStrategicScan", () => {
  it("returns early when no departments exist", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({ billingStatus: "active", aiPaused: false });
    mockPrisma.entity.findMany.mockResolvedValue([]);

    const result = await runStrategicScan("op-1");

    expect(result.approach).toBe("department_audit");
    expect(result.results).toEqual([]);
    expect(result.initiativesCreated).toBe(0);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("completes without error when departments exist", async () => {
    // Reset entity.findMany to ensure no leaking once-values
    mockPrisma.entity.findMany.mockReset();
    // Billing gate
    mockPrisma.operator.findUnique.mockResolvedValue({ billingStatus: "active", aiPaused: false });
    // Default: everything returns empty
    mockPrisma.entity.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);
    mockPrisma.entity.findUnique.mockResolvedValue({ displayName: "Sales", description: null });
    mockPrisma.situation.findMany.mockResolvedValue([]);
    mockPrisma.situationType.findMany.mockResolvedValue([]);
    mockPrisma.goal.findMany.mockResolvedValue([]);
    mockPrisma.activitySignal.count.mockResolvedValue(0);
    mockCallLLM.mockResolvedValue({ text: "[]" });

    // First entity.findMany call (dept selection) returns a department
    mockPrisma.entity.findMany.mockResolvedValueOnce([{ id: "dept-1", displayName: "Sales" }]);

    const result = await runStrategicScan("op-1");

    expect(result.approach).toBe("department_audit");
    expect(result.results).toEqual([]);
    expect(result.initiativesCreated).toBe(0);
  });
});
