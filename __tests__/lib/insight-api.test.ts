import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/domain-scope", () => ({
  getVisibleDomainIds: vi.fn(),
}));
vi.mock("@/lib/knowledge-transfer", () => ({
  promoteInsight: vi.fn(),
  invalidateInsight: vi.fn(),
}));
vi.mock("@/lib/operational-knowledge", () => ({
  extractInsights: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getVisibleDomainIds } from "@/lib/domain-scope";
import { promoteInsight, invalidateInsight } from "@/lib/knowledge-transfer";

const mockGetSessionUser = getSessionUser as ReturnType<typeof vi.fn>;
const mockGetVisibleDepartmentIds = getVisibleDomainIds as ReturnType<typeof vi.fn>;
const mockPromoteInsight = promoteInsight as ReturnType<typeof vi.fn>;
const mockInvalidateInsight = invalidateInsight as ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  operationalInsight: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  entity: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function setupMocks() {
  mockPrisma.operationalInsight = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  };
  mockPrisma.entity = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  };
}

const adminSession = {
  user: { id: "user-1", role: "admin" },
  operatorId: "op-1",
  isSuperadmin: false,
  actingAsOperator: null,
};

const memberSession = {
  user: { id: "user-2", role: "member" },
  operatorId: "op-1",
  isSuperadmin: false,
  actingAsOperator: null,
};

describe("GET /api/insights", () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
  });

  it("member sees own personal + department + operator insights", async () => {
    mockGetSessionUser.mockResolvedValue(memberSession);
    mockGetVisibleDepartmentIds.mockResolvedValue(["dept-1"]);
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-2" });
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins-1",
        aiEntityId: "ai-2",
        domainId: "dept-1",
        insightType: "approach_effectiveness",
        description: "Test insight",
        evidence: '{"sampleSize": 10}',
        confidence: 0.8,
        promptModification: null,
        shareScope: "personal",
        status: "active",
        createdAt: new Date(),
      },
    ]);

    const { GET } = await import("@/app/api/insights/route");
    const url = new URL("http://localhost/api/insights");
    const req = { nextUrl: url } as any;
    const res = await GET(req);
    const data = await res.json();

    expect(data.items).toHaveLength(1);
    // Verify OR conditions include personal + department + operator
    const findManyCall = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
  });

  it("admin sees all insights without OR filter", async () => {
    mockGetSessionUser.mockResolvedValue(adminSession);
    mockGetVisibleDepartmentIds.mockResolvedValue("all");
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/insights/route");
    const url = new URL("http://localhost/api/insights");
    const req = { nextUrl: url } as any;
    await GET(req);

    const findManyCall = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeUndefined();
  });

  it("filters by insightType when provided", async () => {
    mockGetSessionUser.mockResolvedValue(adminSession);
    mockGetVisibleDepartmentIds.mockResolvedValue("all");
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/insights/route");
    const url = new URL("http://localhost/api/insights?insightType=approach_effectiveness");
    const req = { nextUrl: url } as any;
    await GET(req);

    const findManyCall = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(findManyCall.where.insightType).toBe("approach_effectiveness");
  });
});

describe("PATCH /api/insights/[id]", () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
  });

  it("admin promotes personal to department", async () => {
    mockGetSessionUser.mockResolvedValue(adminSession);
    mockPrisma.operationalInsight.findFirst.mockResolvedValue({
      id: "ins-1",
      operatorId: "op-1",
      shareScope: "personal",
      status: "active",
    });
    mockPromoteInsight.mockResolvedValue(undefined);
    mockPrisma.operationalInsight.findUnique.mockResolvedValue({
      id: "ins-1",
      insightType: "approach_effectiveness",
      description: "Test",
      evidence: '{"sampleSize": 10}',
      confidence: 0.8,
      promptModification: null,
      shareScope: "department",
      status: "active",
    });

    const { PATCH } = await import("@/app/api/insights/[id]/route");
    const req = new Request("http://localhost/api/insights/ins-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "promote", targetScope: "department" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ins-1" }) });
    const data = await res.json();

    expect(mockPromoteInsight).toHaveBeenCalledWith("ins-1", "department", "user-1");
    expect(data.shareScope).toBe("department");
  });

  it("admin invalidates insight", async () => {
    mockGetSessionUser.mockResolvedValue(adminSession);
    mockPrisma.operationalInsight.findFirst.mockResolvedValue({
      id: "ins-1",
      operatorId: "op-1",
      status: "active",
    });
    mockInvalidateInsight.mockResolvedValue(undefined);
    mockPrisma.operationalInsight.findUnique.mockResolvedValue({
      id: "ins-1",
      insightType: "approach_effectiveness",
      description: "Test",
      evidence: '{"sampleSize": 10}',
      confidence: 0.8,
      promptModification: null,
      shareScope: "personal",
      status: "invalidated",
    });

    const { PATCH } = await import("@/app/api/insights/[id]/route");
    const req = new Request("http://localhost/api/insights/ins-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "invalidate" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ins-1" }) });
    const data = await res.json();

    expect(mockInvalidateInsight).toHaveBeenCalledWith("ins-1", "user-1");
    expect(data.status).toBe("invalidated");
  });

  it("member blocked from promoting", async () => {
    mockGetSessionUser.mockResolvedValue(memberSession);

    const { PATCH } = await import("@/app/api/insights/[id]/route");
    const req = new Request("http://localhost/api/insights/ins-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "promote", targetScope: "department" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ins-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/insights/[id]/route");
    const req = new Request("http://localhost/api/insights/ins-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "promote", targetScope: "department" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ins-1" }) });

    expect(res.status).toBe(401);
  });
});
