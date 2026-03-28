import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findFirst: vi.fn(), findMany: vi.fn() },
    onboardingAnalysis: { findUnique: vi.fn() },
    orientationSession: { findFirst: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { GET } from "@/app/api/admin/seed-synthetic/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = (await import("@/lib/db")).prisma as any;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/seed-synthetic", () => {
  it("returns 403 for non-superadmin", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, isSuperadmin: false });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns available companies with seed status", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true });
    mockPrisma.operator.findMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companies).toBeDefined();
    // All should be unseeded since no operators found
    for (const status of Object.values(body.companies) as any[]) {
      expect(status.seeded).toBe(false);
    }
  });
});
