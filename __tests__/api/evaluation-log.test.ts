import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    evaluationLog: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    entity: {
      findMany: vi.fn(),
    },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/evaluation-log/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/evaluation-log");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/evaluation-log", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "member" }, operatorId: "op-1", isSuperadmin: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns paginated log entries for admin", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, operatorId: "op-1", isSuperadmin: false });
    mockPrisma.evaluationLog.findMany.mockResolvedValue([
      { id: "el-1", actorEntityId: "ent-1", sourceType: "email", sourceId: "msg-1", classification: "action_required", summary: "Do task", reasoning: "Direct ask", urgency: "high", confidence: 0.9, situationId: "sit-1", metadata: {}, evaluatedAt: new Date() },
    ]);
    mockPrisma.evaluationLog.groupBy.mockResolvedValue([
      { classification: "action_required", _count: 10 },
      { classification: "awareness", _count: 5 },
      { classification: "irrelevant", _count: 20 },
    ]);
    mockPrisma.entity.findMany.mockResolvedValue([{ id: "ent-1", displayName: "Alice" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].actorName).toBe("Alice");
    expect(body.stats.total).toBe(35);
    expect(body.nextCursor).toBeNull();
  });

  it("filters by classification", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, operatorId: "op-1", isSuperadmin: false });
    mockPrisma.evaluationLog.findMany.mockResolvedValue([]);
    mockPrisma.evaluationLog.groupBy.mockResolvedValue([]);
    mockPrisma.entity.findMany.mockResolvedValue([]);

    await GET(makeRequest({ classification: "awareness" }));

    expect(mockPrisma.evaluationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classification: "awareness" }),
      }),
    );
  });
});
