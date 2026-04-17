import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/wiki-engine", () => ({
  resolvePageSlug: vi.fn(),
}));

vi.mock("@/lib/deliberation-pass", () => ({
  overrideAutoAppliedDecision: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolvePageSlug } from "@/lib/wiki-engine";
import { overrideAutoAppliedDecision } from "@/lib/deliberation-pass";
import { POST } from "@/app/api/situations/[id]/decisions/[decisionId]/override/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;
const mockResolve = resolvePageSlug as ReturnType<typeof vi.fn>;
const mockOverride = overrideAutoAppliedDecision as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeCtx(id: string, decisionId: string) {
  return { params: Promise.resolve({ id, decisionId }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/situations/[id]/decisions/[decisionId]/override", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ newChoice: "Instead" }), makeCtx("sit-1", "dec-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin and not situation assignee", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "member", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", properties: { assigned_to: "someone-else-slug" } },
    ]);
    mockResolve.mockResolvedValue("user-slug");

    const res = await POST(makeReq({ newChoice: "Instead" }), makeCtx("sit-1", "dec-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when decisionId not on page", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "admin", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", properties: {} },
    ]);
    mockOverride.mockResolvedValue({ success: false, error: "decision_not_found_or_not_auto_applied" });

    const res = await POST(makeReq({ newChoice: "Instead" }), makeCtx("sit-1", "dec-1"));
    expect(res.status).toBe(404);
  });

  it("calls overrideAutoAppliedDecision and returns 200 on admin happy path", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "admin", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", properties: {} },
    ]);
    mockOverride.mockResolvedValue({ success: true });

    const res = await POST(makeReq({ newChoice: "Formal tone" }), makeCtx("sit-1", "dec-1"));
    expect(res.status).toBe(200);
    expect(mockOverride).toHaveBeenCalledWith("op-1", "sit-slug", "dec-1", "Formal tone", "u-1");
    const body = await res.json();
    expect(body.newChoice).toBe("Formal tone");
    expect(body._wikiFirst).toBe(true);
  });
});
