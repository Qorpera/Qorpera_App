import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ───────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    onboardingAgentRun: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    sourceConnector: { count: vi.fn() },
    contentChunk: { count: vi.fn() },
    entity: { findMany: vi.fn(), findFirst: vi.fn() },
    activitySignal: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    internalDocument: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  searchEntities: vi.fn(),
  getEntityContext: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tool Registry", () => {
  it("getToolsForAgent returns all tools", async () => {
    const { getToolsForAgent } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const tools = getToolsForAgent("org_analyst");
    expect(tools.length).toBe(11);
    expect(tools.map((t) => t.name)).toContain("search_content");
    expect(tools.map((t) => t.name)).toContain("search_entities");
    expect(tools.map((t) => t.name)).toContain("get_entity_details");
    expect(tools.map((t) => t.name)).toContain("search_activity");
    expect(tools.map((t) => t.name)).toContain("get_calendar_patterns");
    expect(tools.map((t) => t.name)).toContain("get_email_patterns");
    expect(tools.map((t) => t.name)).toContain("get_document_list");
    expect(tools.map((t) => t.name)).toContain("get_content_by_ids");
    expect(tools.map((t) => t.name)).toContain("get_financial_data");
    expect(tools.map((t) => t.name)).toContain("get_crm_data");
    expect(tools.map((t) => t.name)).toContain("get_slack_channels");
  });

  it("executeTool calls handler and returns result with timing", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const { searchEntities } = await import("@/lib/entity-resolution");
    (searchEntities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "e1", displayName: "Acme Corp", typeName: "Company", typeSlug: "company", status: "active", properties: { domain: "acme.com" } },
    ]);

    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("search_entities", { query: "Acme" }, ctx);

    expect(result.result).toContain("Acme Corp");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("executeTool returns error for unknown tool", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("nonexistent_tool", {}, ctx);

    expect(result.result).toContain("Unknown tool");
    expect(result.durationMs).toBe(0);
  });

  it("executeTool catches handler errors gracefully", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const { searchEntities } = await import("@/lib/entity-resolution");
    (searchEntities as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("search_entities", { query: "test" }, ctx);

    expect(result.result).toContain("Error executing search_entities");
    expect(result.result).toContain("DB connection lost");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Progress Messages", () => {
  it("addProgressMessage uses atomic JSON append", async () => {
    mockPrisma.$executeRaw = vi.fn().mockResolvedValue(1);

    const { addProgressMessage } = await import(
      "@/lib/onboarding-intelligence/progress"
    );
    await addProgressMessage("a1", "Investigating emails", "org_analyst");

    // Should use $executeRaw for atomic append
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it("estimateMinutesRemaining returns correct estimates", async () => {
    const { estimateMinutesRemaining } = await import(
      "@/lib/onboarding-intelligence/progress"
    );
    expect(estimateMinutesRemaining("round_0")).toBe(40);
    expect(estimateMinutesRemaining("round_1")).toBe(30);
    expect(estimateMinutesRemaining("synthesis")).toBe(2);
    expect(estimateMinutesRemaining("unknown")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getBaseUrl
// ═══════════════════════════════════════════════════════════════════════════════

describe("getBaseUrl", () => {
  it("getBaseUrl uses NEXT_PUBLIC_APP_URL first", async () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.qorpera.com";

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    expect(mod.getBaseUrl()).toBe("https://app.qorpera.com");

    process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("getBaseUrl falls back to localhost", async () => {
    const origApp = process.env.NEXT_PUBLIC_APP_URL;
    const origVercel = process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    expect(mod.getBaseUrl()).toBe("http://localhost:3000");

    process.env.NEXT_PUBLIC_APP_URL = origApp;
    process.env.VERCEL_URL = origVercel;
  });
});
