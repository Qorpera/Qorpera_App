import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/domain-scope", () => ({
  getVisibleDomainIds: vi.fn().mockResolvedValue("all"),
  situationScopeFilter: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    situation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    entity: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/entity-resolution", () => ({
  getEntityContext: vi.fn().mockResolvedValue(null),
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET as listGET } from "@/app/api/situations/route";
import { GET as detailGET } from "@/app/api/situations/[id]/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

function makeListRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/situations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: new URL(url.toString()) } as any;
}

beforeEach(() => vi.clearAllMocks());

describe("situations API — trigger evidence", () => {
  it("list endpoint returns triggerSummary", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, operatorId: "op-1", effectiveUserId: "u-1", effectiveRole: "admin" });
    mockPrisma.situation.findMany.mockResolvedValue([
      {
        id: "sit-1",
        situationTypeId: "st-1",
        situationType: { name: "Test", slug: "test", autonomyLevel: "supervised", scopeEntityId: null },
        severity: 0.5,
        confidence: 0.8,
        status: "detected",
        source: "content_detected",
        triggerEntityId: "ent-1",
        triggerSummary: "boss re: Q3 Report — Prepare Q3 report by Friday",
        reasoning: null,
        proposedAction: null,
        editInstruction: null,
        createdAt: new Date("2026-03-31T10:00:00Z"),
        resolvedAt: null,
      },
    ]);
    mockPrisma.situation.count.mockResolvedValue(1);
    mockPrisma.entity.findMany.mockResolvedValue([{ id: "ent-1", displayName: "Acme" }]);

    const res = await listGET(makeListRequest({ status: "detected" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].triggerSummary).toBe("boss re: Q3 Report — Prepare Q3 report by Friday");
  });

  it("detail endpoint returns parsed triggerEvidence and triggerSummary", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, operatorId: "op-1", effectiveUserId: "u-1", effectiveRole: "admin" });

    const evidenceObj = {
      type: "content",
      sourceType: "email",
      sender: "boss@external.com",
      subject: "Q3 Report",
      content: "Please prepare the Q3 report by Friday.",
      summary: "Prepare Q3 report by Friday",
    };

    mockPrisma.situation.findFirst.mockResolvedValue({
      id: "sit-1",
      operatorId: "op-1",
      situationTypeId: "st-1",
      situationType: { id: "st-1", name: "Test", slug: "test", description: "Test type", autonomyLevel: "supervised", scopeEntityId: null },
      severity: 0.5,
      confidence: 0.8,
      status: "detected",
      source: "content_detected",
      triggerEntityId: null,
      triggerEventId: null,
      triggerEvidence: JSON.stringify(evidenceObj),
      triggerSummary: "boss re: Q3 Report — Prepare Q3 report by Friday",
      contextSnapshot: null,
      reasoning: null,
      proposedAction: null,
      executionPlanId: null,
      actionTaken: null,
      outcome: null,
      outcomeDetails: null,
      feedback: null,
      feedbackRating: null,
      feedbackCategory: null,
      editInstruction: null,
      resolvedAt: null,
      createdAt: new Date("2026-03-31T10:00:00Z"),
    });

    const res = await detailGET(
      {} as any,
      { params: { id: "sit-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // triggerEvidence should be a parsed object, not a string
    expect(body.triggerEvidence).toEqual(evidenceObj);
    expect(typeof body.triggerEvidence).toBe("object");
    expect(body.triggerEvidence.type).toBe("content");
    expect(body.triggerEvidence.sender).toBe("boss@external.com");

    // triggerSummary should be a string
    expect(body.triggerSummary).toBe("boss re: Q3 Report — Prepare Q3 report by Friday");
  });

  it("detail endpoint handles corrupt triggerEvidence gracefully", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, operatorId: "op-1", effectiveUserId: "u-1", effectiveRole: "admin" });

    mockPrisma.situation.findFirst.mockResolvedValue({
      id: "sit-2",
      operatorId: "op-1",
      situationTypeId: "st-1",
      situationType: { id: "st-1", name: "Test", slug: "test", description: "Test type", autonomyLevel: "supervised", scopeEntityId: null },
      severity: 0.5,
      confidence: 0.8,
      status: "detected",
      source: "detected",
      triggerEntityId: null,
      triggerEventId: null,
      triggerEvidence: "not valid json {{{",
      triggerSummary: "some summary",
      contextSnapshot: null,
      reasoning: null,
      proposedAction: null,
      executionPlanId: null,
      actionTaken: null,
      outcome: null,
      outcomeDetails: null,
      feedback: null,
      feedbackRating: null,
      feedbackCategory: null,
      editInstruction: null,
      resolvedAt: null,
      createdAt: new Date("2026-03-31T10:00:00Z"),
    });

    const res = await detailGET(
      {} as any,
      { params: { id: "sit-2" } },
    );
    // Should NOT crash — should return null for corrupt JSON
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggerEvidence).toBeNull();
    expect(body.triggerSummary).toBe("some summary");
  });
});
