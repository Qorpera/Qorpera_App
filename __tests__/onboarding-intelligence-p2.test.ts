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
    sourceConnector: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentChunk: { count: vi.fn() },
    entity: { findMany: vi.fn() },
    activitySignal: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/config-encryption", () => ({
  encryptConfig: vi.fn().mockReturnValue("encrypted-config"),
  decryptConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/connectors/capability-registration", () => ({
  registerConnectorCapabilities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/connector-filters", () => ({
  ACTIVE_CONNECTOR: { deletedAt: null },
}));

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRelevantChunks: vi.fn(),
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/rag/embedder", () => ({
  embedChunks: vi.fn(),
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
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PEOPLE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

describe("People Discovery", () => {
  it("buildPeopleRegistry produces correct counts from entity + content + signal data", async () => {
    // Mock internal domains
    mockPrisma.user.findMany.mockResolvedValue([
      { email: "alice@company.dk" },
      { email: "bob@company.dk" },
    ]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: "admin@company.dk" });

    // Mock entity people (contacts with email identity)
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "e1",
        displayName: "Alice Hansen",
        sourceSystem: "hubspot",
        externalId: "hs-1",
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "alice@company.dk", property: { slug: "email", identityRole: "email" } },
          { value: "Sales Manager", property: { slug: "title", identityRole: null } },
        ],
      },
      {
        id: "e2",
        displayName: "External Client",
        sourceSystem: "hubspot",
        externalId: "hs-2",
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "client@external.com", property: { slug: "email", identityRole: "email" } },
        ],
      },
    ]);

    // Mock email content chunks
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("sourceType") && sql.includes("email")) {
        return [
          { metadata: JSON.stringify({ sender: "bob@company.dk", to: ["alice@company.dk"] }) },
          { metadata: JSON.stringify({ sender: "client@external.com", to: ["bob@company.dk"] }) },
        ];
      }
      if (sql.includes("slack_message")) {
        return [{ sender: "alice@company.dk", cnt: BigInt(15) }];
      }
      return [];
    });

    // Mock activity signals
    mockPrisma.activitySignal.findMany.mockResolvedValue([
      {
        signalType: "meeting_held",
        metadata: JSON.stringify({ attendees: ["alice@company.dk", "bob@company.dk", "partner@other.com"] }),
      },
    ]);

    const { buildPeopleRegistry } = await import(
      "@/lib/onboarding-intelligence/people-discovery"
    );

    const registry = await buildPeopleRegistry("op1");

    // Should find: alice@company.dk, bob@company.dk (internal), client@external.com, partner@other.com (external)
    expect(registry.length).toBeGreaterThanOrEqual(3);

    // Internal classification
    const alice = registry.find((p) => p.email === "alice@company.dk");
    expect(alice).toBeTruthy();
    expect(alice!.isInternal).toBe(true);
    expect(alice!.displayName).toBe("Alice Hansen");
    expect(alice!.entityId).toBe("e1");

    const client = registry.find((p) => p.email === "client@external.com");
    expect(client).toBeTruthy();
    expect(client!.isInternal).toBe(false);

    // Internal people should come first
    const firstExternal = registry.findIndex((p) => !p.isInternal);
    const lastInternal = registry.findLastIndex((p) => p.isInternal);
    if (firstExternal >= 0 && lastInternal >= 0) {
      expect(lastInternal).toBeLessThan(firstExternal);
    }
  });

  it("deduplicates: same person from 3 sources → 1 entry with multiple sources", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ email: "alice@company.dk" }]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: "admin@company.dk" });

    // Alice appears in entity, email metadata, and Slack
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "e1",
        displayName: "Alice",
        sourceSystem: "hubspot",
        externalId: null,
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "alice@company.dk", property: { slug: "email", identityRole: "email" } },
        ],
      },
    ]);

    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("email")) {
        return [{ metadata: JSON.stringify({ sender: "alice@company.dk" }) }];
      }
      if (sql.includes("slack_message")) {
        return [{ sender: "alice@company.dk", cnt: BigInt(5) }];
      }
      return [];
    });

    mockPrisma.activitySignal.findMany.mockResolvedValue([]);

    const { buildPeopleRegistry } = await import(
      "@/lib/onboarding-intelligence/people-discovery"
    );

    const registry = await buildPeopleRegistry("op1");

    const aliceEntries = registry.filter((p) => p.email === "alice@company.dk");
    expect(aliceEntries).toHaveLength(1);

    // Should have multiple sources
    expect(aliceEntries[0].sources.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORAL ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Temporal Analyst", () => {
  it("TEMPORAL_ANALYST_PROMPT contains key investigation instructions", async () => {
    const { TEMPORAL_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/temporal-analyst"
    );
    expect(TEMPORAL_ANALYST_PROMPT).toContain("Temporal Analyst");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("freshness");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("supersed");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("temporalMap");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE WORKSPACE OAUTH
// ═══════════════════════════════════════════════════════════════════════════════

describe("Google Workspace OAuth", () => {
  it("auth-url includes all required scopes", async () => {
    const { getSessionUser } = await import("@/lib/auth");
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "admin" },
      operatorId: "op1",
    });

    // Mock cookies
    vi.mock("next/headers", () => ({
      cookies: vi.fn().mockResolvedValue({
        set: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      }),
    }));

    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const { POST } = await import(
      "@/app/api/connectors/google-workspace/auth-url/route"
    );
    const response = await POST();
    const body = await response.json();

    expect(body.url).toBeDefined();
    expect(body.url).toContain("gmail.readonly");
    expect(body.url).toContain("drive");
    expect(body.url).toContain("calendar");
    expect(body.url).toContain("spreadsheets");
    expect(body.url).toContain("prompt=consent");
    expect(body.url).toContain("access_type=offline");

    process.env.GOOGLE_CLIENT_ID = originalClientId;
  });
});
