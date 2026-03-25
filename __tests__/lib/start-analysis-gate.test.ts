import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    onboardingAgentRun: { deleteMany: vi.fn() },
    orientationSession: { updateMany: vi.fn() },
    sourceConnector: { count: vi.fn() },
    contentChunk: { count: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const mockPrisma = prisma as any;
const mockSession = getSessionUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({
    user: { id: "u1", role: "admin" },
    operatorId: "op1",
  });
  mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue(null);
});

describe("start-analysis gate", () => {
  it("rejects when no connectors exist", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(0);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    const { POST } = await import("@/app/api/onboarding/start-analysis/route");
    const res = await POST(new Request("http://localhost/api/onboarding/start-analysis", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No active connectors");
  });

  it("rejects when connectors exist but no content synced", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(1);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    const { POST } = await import("@/app/api/onboarding/start-analysis/route");
    const res = await POST(new Request("http://localhost/api/onboarding/start-analysis", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no data synced");
  });

  it("allows analysis when connectors and content both exist", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(2);
    mockPrisma.contentChunk.count.mockResolvedValue(100);
    mockPrisma.onboardingAgentRun.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.create.mockResolvedValue({ id: "a1", status: "pending" });
    mockPrisma.orientationSession.updateMany.mockResolvedValue({});

    const { POST } = await import("@/app/api/onboarding/start-analysis/route");
    const res = await POST(new Request("http://localhost/api/onboarding/start-analysis", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysisId).toBe("a1");
  });
});
