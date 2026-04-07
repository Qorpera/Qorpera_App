import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userScope: { findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/auth/me/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

function makeRequest() {
  return new Request("http://localhost/api/auth/me") as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/auth/me — impersonation", () => {
  it("returns impersonated user identity and scopes when acting as user", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "superadmin-id",
        name: "Jonas",
        email: "jonas@qorpera.com",
        role: "superadmin",
        entityId: null,
        locale: "en",
        operatorId: "sa-op",
        operator: { companyName: "Qorpera", industry: "SaaS" },
      },
      operatorId: "op-boltly",
      isSuperadmin: true,
      actingAsOperator: true,
      actingAsUser: true,
      effectiveUserId: "user-alice",
      effectiveRole: "member",
      impersonatedUserName: "Alice Bolt",
    });

    // Impersonated user lookup
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-alice",
      name: "Alice Bolt",
      email: "alice@boltly.dk",
      role: "member",
      entityId: "entity-alice",
      locale: "da",
    });

    // Scopes for impersonated member
    mockPrisma.userScope.findMany.mockResolvedValue([
      { domainEntityId: "dept-service" },
    ]);

    // Acting operator details
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op-boltly",
      companyName: "Boltly",
      industry: "Electrical",
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // User identity should be the impersonated user, not the superadmin
    expect(body.user.id).toBe("user-alice");
    expect(body.user.name).toBe("Alice Bolt");
    expect(body.user.email).toBe("alice@boltly.dk");
    expect(body.user.role).toBe("member");

    // Scopes should reflect impersonated user's department access
    expect(body.scopes).toEqual(["dept-service"]);

    // Impersonation flags
    expect(body.actingAsUser).toBe(true);
    expect(body.impersonatedUserName).toBe("Alice Bolt");

    // Operator should be the acting operator, not the superadmin's
    expect(body.operator.companyName).toBe("Boltly");
  });

  it("returns superadmin identity when not impersonating", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "superadmin-id",
        name: "Jonas",
        email: "jonas@qorpera.com",
        role: "superadmin",
        entityId: null,
        locale: "en",
        operatorId: "sa-op",
        operator: { companyName: "Qorpera", industry: "SaaS" },
      },
      operatorId: "sa-op",
      isSuperadmin: true,
      actingAsOperator: false,
      actingAsUser: false,
      effectiveUserId: "superadmin-id",
      effectiveRole: "superadmin",
      impersonatedUserName: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.user.id).toBe("superadmin-id");
    expect(body.user.name).toBe("Jonas");
    expect(body.scopes).toBe("all");
    expect(body.actingAsUser).toBe(false);
    expect(body.impersonatedUserName).toBeNull();
  });
});
