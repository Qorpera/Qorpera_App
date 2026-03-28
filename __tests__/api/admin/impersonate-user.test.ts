import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

// Mock next/headers cookies
const { mockCookieSet } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
    get: vi.fn(),
  }),
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/impersonate-user/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/impersonate-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/impersonate-user", () => {
  it("returns 403 for non-superadmin", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, isSuperadmin: false, actingAsOperator: false });
    const res = await POST(makeRequest({ userId: "u1" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for superadmin not acting as operator", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true, actingAsOperator: false });
    const res = await POST(makeRequest({ userId: "u1" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent user", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true, actingAsOperator: true, operatorId: "op-1" });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ userId: "u-missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 for user in different operator", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true, actingAsOperator: true, operatorId: "op-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", email: "a@test.com", role: "member", operatorId: "op-other" });
    const res = await POST(makeRequest({ userId: "u1" }));
    expect(res.status).toBe(403);
  });

  it("sets acting_user_id cookie for valid user in same operator", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true, actingAsOperator: true, operatorId: "op-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", email: "a@test.com", role: "member", operatorId: "op-1" });

    const res = await POST(makeRequest({ userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.name).toBe("Alice");
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acting_user_id", "u1",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });
});
