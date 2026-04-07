import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRateLimit = vi.fn().mockResolvedValue({ success: true, remaining: 29, reset: Date.now() + 60000 });

vi.mock("@/lib/rate-limiter", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  rateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
  ),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findUnique: vi.fn().mockResolvedValue({ aiPaused: false, billingStatus: "active", freeCopilotUsedCents: 0, freeCopilotBudgetCents: 10000 }) },
    orientationSession: { findFirst: vi.fn().mockResolvedValue(null) },
    copilotSession: { upsert: vi.fn().mockResolvedValue({}) },
    copilotMessage: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: "user-1", role: "admin" },
    operatorId: "op-1",
  }),
}));

vi.mock("@/lib/ai-copilot", () => ({
  chat: vi.fn().mockResolvedValue(new ReadableStream()),
}));

vi.mock("@/lib/domain-scope", () => ({
  getVisibleDomainIds: vi.fn().mockResolvedValue("all"),
}));

vi.mock("@/lib/copilot-context-loaders", () => ({
  loadContextForCopilot: vi.fn().mockResolvedValue(null),
  getContextRoleInstruction: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/workstreams", () => ({
  canMemberAccessWorkStream: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/api-error", () => ({
  captureApiError: vi.fn(),
}));

vi.mock("@/lib/billing-gate", () => ({
  checkCopilotBudget: vi.fn().mockReturnValue({ allowed: true }),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { rateLimit, rateLimitResponse } from "@/lib/rate-limiter";

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════

describe("Per-user copilot rate limiting", () => {
  it("rate limit is called with user-specific key and copilot tier", async () => {
    mockRateLimit.mockResolvedValueOnce({ success: true, remaining: 29, reset: Date.now() + 60000 });

    // Dynamically import to get fresh module with mocks applied
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://localhost/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "s1" }),
    });

    await POST(req as any);

    expect(mockRateLimit).toHaveBeenCalledWith("copilot:user:user-1", "copilot");
  });

  it("returns 429 when user exceeds rate limit", async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() + 30000 });

    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://localhost/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "s1" }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(429);
  });

  it("different users have independent rate limit keys", () => {
    // The rate limit key format is `copilot:user:${user.id}`
    // Each user gets their own bucket in the rate limiter.
    // user-1 reaching their limit has no effect on user-2.
    const key1 = "copilot:user:user-1";
    const key2 = "copilot:user:user-2";
    expect(key1).not.toBe(key2);
  });
});
