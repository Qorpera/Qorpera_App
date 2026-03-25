import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    onboardingAgentRun: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Prompt Registry", () => {
  it("returns correct prompts for registered agents", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );

    const temporal = getAgentPrompt("temporal_analyst");
    expect(temporal).toBeDefined();
    expect(temporal).toContain("Temporal Analyst");

    const org = getAgentPrompt("org_analyst");
    expect(org).toBeDefined();
    expect(org).toContain("Organizational Analyst");

    const process = getAgentPrompt("process_analyst");
    expect(process).toBeDefined();
    expect(process).toContain("Process Analyst");

    const relationship = getAgentPrompt("relationship_analyst");
    expect(relationship).toBeDefined();
    expect(relationship).toContain("Relationship Analyst");
  });

  it("returns undefined for unregistered agents", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );

    expect(getAgentPrompt("unknown_agent")).toBeUndefined();
    expect(getAgentPrompt("nonexistent_agent_xyz")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ORG ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Org Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { ORG_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/org-analyst"
    );
    expect(ORG_ANALYST_PROMPT).toContain("Structural Discovery");
    expect(ORG_ANALYST_PROMPT).toContain("Hierarchy Mapping");
    expect(ORG_ANALYST_PROMPT).toContain("Reality vs. Documentation");
    expect(ORG_ANALYST_PROMPT).toContain("Role Classification");
    expect(ORG_ANALYST_PROMPT).toContain("departments");
    expect(ORG_ANALYST_PROMPT).toContain("teamComposition");
    expect(ORG_ANALYST_PROMPT).toContain("reportingRelationships");
    // Danish keywords
    expect(ORG_ANALYST_PROMPT).toContain("organisationsdiagram");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Process Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { PROCESS_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/process-analyst"
    );
    expect(PROCESS_ANALYST_PROMPT).toContain("Documented Processes");
    expect(PROCESS_ANALYST_PROMPT).toContain("Behavioral Process Mining");
    expect(PROCESS_ANALYST_PROMPT).toContain("Handoff Quality");
    expect(PROCESS_ANALYST_PROMPT).toContain("Situation Type Recommendations");
    expect(PROCESS_ANALYST_PROMPT).toContain("processes");
    expect(PROCESS_ANALYST_PROMPT).toContain("bottleneckPeople");
    // Danish keywords
    expect(PROCESS_ANALYST_PROMPT).toContain("procesbeskrivelse");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Relationship Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { RELATIONSHIP_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/relationship-analyst"
    );
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Relationship Inventory");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Health Assessment");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Risk Identification");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Relationship Intelligence");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("relationships");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("riskFlags");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("untrackedRelationships");
  });
});
