import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    situation: { findMany: vi.fn(), count: vi.fn() },
    notification: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    userScope: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/domain-scope", () => ({
  getVisibleDomainIds: vi.fn(),
  situationScopeFilter: vi.fn().mockReturnValue({}),
}));

import { getSessionUser } from "@/lib/auth";
import { getVisibleDomainIds } from "@/lib/domain-scope";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockVisibleDepts = getVisibleDomainIds as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("Impersonation scoping", () => {
  it("situations route uses effectiveUserId for dept visibility", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "superadmin-id", role: "superadmin", operatorId: "sa-op" },
      operatorId: "op-1",
      isSuperadmin: true,
      actingAsOperator: true,
      actingAsUser: true,
      effectiveUserId: "impersonated-user-id",
      effectiveRole: "member",
      impersonatedUserName: "Alice",
    });
    mockVisibleDepts.mockResolvedValue(["dept-1"]);

    const { prisma } = await import("@/lib/db");
    (prisma as any).situation.findMany.mockResolvedValue([]);
    (prisma as any).situation.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/situations/route");
    const url = new URL("http://localhost/api/situations");
    const req = { nextUrl: url, url: url.toString() } as any;
    await GET(req);

    // Should use the impersonated user's ID for dept visibility
    expect(mockVisibleDepts).toHaveBeenCalledWith("op-1", "impersonated-user-id");
  });

  it("situations route filters by assignedUserId for impersonated member", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "superadmin-id", role: "superadmin", operatorId: "sa-op" },
      operatorId: "op-1",
      isSuperadmin: true,
      actingAsOperator: true,
      actingAsUser: true,
      effectiveUserId: "member-id",
      effectiveRole: "member",
      impersonatedUserName: "Alice",
    });
    mockVisibleDepts.mockResolvedValue(["dept-1"]);

    const { prisma } = await import("@/lib/db");
    (prisma as any).situation.findMany.mockResolvedValue([]);
    (prisma as any).situation.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/situations/route");
    const url = new URL("http://localhost/api/situations");
    const req = { nextUrl: url, url: url.toString() } as any;
    await GET(req);

    // Should filter situations by the impersonated member's assigned ID
    expect((prisma as any).situation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedUserId: "member-id" }),
      }),
    );
  });
});
