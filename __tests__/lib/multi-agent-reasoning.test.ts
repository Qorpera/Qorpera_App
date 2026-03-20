vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLLM } from "@/lib/ai-provider";
import {
  estimateContextTokens,
  shouldUseMultiAgent,
  MULTI_AGENT_TOKEN_THRESHOLD,
  runMultiAgentReasoning,
} from "@/lib/multi-agent-reasoning";
import { ReasoningOutputSchema } from "@/lib/reasoning-types";
import type { ReasoningInput } from "@/lib/reasoning-prompts";

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const minimalInput: ReasoningInput = {
  situationType: { name: "Test Situation", description: "A test situation for unit testing", autonomyLevel: "supervised" },
  severity: 0.5,
  confidence: 0.8,
  triggerEntity: { displayName: "Acme Corp", type: "company", category: "external", properties: { amount: "50000", status: "active" } },
  departments: [{ id: "dept1", name: "Sales", description: "Sales team", lead: { name: "Maria", role: "Sales Manager" }, memberCount: 5 }],
  departmentKnowledge: [],
  relatedEntities: { base: [], digital: [], external: [] },
  recentEvents: [],
  priorSituations: [],
  autonomyLevel: "supervised",
  permittedActions: [{ name: "send_email", description: "Send an email", connector: "google", inputSchema: null }],
  blockedActions: [],
  businessContext: null,
  activityTimeline: { buckets: [], trend: "No trend data available", totalSignals: 0 },
  communicationContext: { excerpts: [], sourceBreakdown: {} },
  crossDepartmentSignals: { signals: [] },
  connectorCapabilities: [],
};

const validSpecialistResponse = JSON.stringify({
  domain: "financial",
  summary: "Financial analysis complete with sufficient evidence.",
  keyFindings: ["Revenue at 50000"],
  riskFactors: [],
  opportunities: ["Upsell potential"],
  recommendedActions: ["Send follow-up"],
  evidenceCited: ["amount: 50000"],
  confidenceLevel: 0.7,
  gapsIdentified: [],
});

const validCoordinatorResponse = JSON.stringify({
  analysis: "All specialists agree the situation warrants action based on financial data.",
  evidenceSummary: "Financial: revenue 50K, active status. Communication: no data. Compliance: no prior situations.",
  consideredActions: [{
    action: "send_email",
    evidenceFor: ["Financial analyst recommends follow-up"],
    evidenceAgainst: ["No communication data to confirm relationship health"],
    expectedOutcome: "Re-engage customer",
  }],
  actionPlan: [{
    title: "Send follow-up email",
    description: "Send a follow-up email to re-engage Acme Corp based on financial indicators.",
    executionMode: "action",
    actionCapabilityName: "send_email",
    params: { to: "acme@example.com", subject: "Follow up", body: "Hello..." },
  }],
  confidence: 0.75,
  missingContext: ["Communication history would improve confidence"],
});

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCallLLM.mockReset();
});

describe("estimateContextTokens", () => {
  it("sums all section token estimates", () => {
    const sections = [
      { section: "triggerEntity", itemCount: 1, tokenEstimate: 200 },
      { section: "departments", itemCount: 2, tokenEstimate: 300 },
      { section: "activityTimeline", itemCount: 15, tokenEstimate: 500 },
    ];
    expect(estimateContextTokens(sections)).toBe(1000);
  });

  it("returns 0 for empty sections", () => {
    expect(estimateContextTokens([])).toBe(0);
  });
});

describe("shouldUseMultiAgent", () => {
  it("returns false below threshold", () => {
    const sections = [{ section: "test", itemCount: 1, tokenEstimate: 5000 }];
    expect(shouldUseMultiAgent(sections)).toBe(false);
  });

  it("returns true above threshold", () => {
    const sections = [
      { section: "a", itemCount: 1, tokenEstimate: 7000 },
      { section: "b", itemCount: 1, tokenEstimate: 6000 },
    ];
    expect(shouldUseMultiAgent(sections)).toBe(true);
  });

  it("returns false at exactly the threshold", () => {
    const sections = [{ section: "test", itemCount: 1, tokenEstimate: MULTI_AGENT_TOKEN_THRESHOLD }];
    expect(shouldUseMultiAgent(sections)).toBe(false);
  });

  it("returns true one above threshold", () => {
    const sections = [{ section: "test", itemCount: 1, tokenEstimate: MULTI_AGENT_TOKEN_THRESHOLD + 1 }];
    expect(shouldUseMultiAgent(sections)).toBe(true);
  });
});

describe("ReasoningOutputSchema validation", () => {
  it("accepts valid complete output", () => {
    const valid = {
      analysis: "This entity shows declining engagement based on email patterns.",
      evidenceSummary: "Email volume dropped 60%. No meetings in 14 days. Support tickets rising.",
      consideredActions: [
        {
          action: "send_email",
          evidenceFor: ["Email silence for 14 days"],
          evidenceAgainst: ["Recent support ticket may indicate they are engaged"],
          expectedOutcome: "Re-engage the customer relationship",
        },
      ],
      actionPlan: [{
        title: "Send check-in email",
        description: "Re-engage the customer with a check-in email.",
        executionMode: "action",
        actionCapabilityName: "send_email",
        params: { to: "client@example.com", subject: "Checking in", body: "Hi..." },
      }],
      confidence: 0.85,
      missingContext: null,
    };
    const result = ReasoningOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts null actionPlan", () => {
    const valid = {
      analysis: "Insufficient evidence to act.",
      evidenceSummary: "No financial data, no communication history.",
      consideredActions: [],
      actionPlan: null,
      confidence: 0.3,
      missingContext: ["Need email history", "Need invoice data"],
    };
    const result = ReasoningOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects analysis shorter than 10 chars", () => {
    const invalid = {
      analysis: "Short",
      evidenceSummary: "Short but ok at exactly 10",
      consideredActions: [],
      actionPlan: null,
      confidence: 0.5,
      missingContext: null,
    };
    const result = ReasoningOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0-1 range", () => {
    const invalid = {
      analysis: "Valid analysis text here.",
      evidenceSummary: "Valid evidence summary here.",
      consideredActions: [],
      actionPlan: null,
      confidence: 1.5,
      missingContext: null,
    };
    const result = ReasoningOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("runMultiAgentReasoning — specialist execution", () => {
  it("calls LLM 4 times — 3 specialists + 1 coordinator", async () => {
    mockCallLLM
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validCoordinatorResponse });

    const sections = [{ section: "test", itemCount: 1, tokenEstimate: 15000 }];

    const result = await runMultiAgentReasoning(minimalInput, sections);

    expect(mockCallLLM).toHaveBeenCalledTimes(4);
    expect(result.findings).toHaveLength(3);
    expect(result.coordinatorReasoning.actionPlan).not.toBeNull();
    expect(result.routingReason).toContain("15000");
  });

  it("handles specialist failure gracefully — fallback finding", async () => {
    mockCallLLM
      .mockRejectedValueOnce(new Error("API timeout"))
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validCoordinatorResponse });

    const sections = [{ section: "test", itemCount: 1, tokenEstimate: 15000 }];
    const result = await runMultiAgentReasoning(minimalInput, sections);

    expect(result.findings).toHaveLength(3);
    expect(result.findings[0].summary).toContain("unavailable");
    expect(result.findings[0].confidenceLevel).toBe(0);
    expect(result.findings[1].confidenceLevel).toBeGreaterThan(0);
  });

  it("passes editInstruction and priorFeedback to coordinator", async () => {
    mockCallLLM
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validCoordinatorResponse });

    const sections = [{ section: "test", itemCount: 1, tokenEstimate: 15000 }];

    await runMultiAgentReasoning(
      minimalInput,
      sections,
      "TestCo",
      "Change the email tone to be more formal",
      ["  - Previous feedback: be more concise"],
    );

    const coordinatorCall = mockCallLLM.mock.calls[3];
    const coordinatorUserPrompt = coordinatorCall[0].messages[0].content;
    expect(coordinatorUserPrompt).toContain("Change the email tone to be more formal");
    expect(coordinatorUserPrompt).toContain("Previous feedback: be more concise");
  });

  it("handles invalid coordinator JSON — returns fallback", async () => {
    mockCallLLM
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: validSpecialistResponse })
      .mockResolvedValueOnce({ text: "This is not JSON at all" })
      .mockResolvedValueOnce({ text: "Still not JSON" });

    const sections = [{ section: "test", itemCount: 1, tokenEstimate: 15000 }];
    const result = await runMultiAgentReasoning(minimalInput, sections);

    expect(mockCallLLM).toHaveBeenCalledTimes(5);
    expect(result.coordinatorReasoning.confidence).toBe(0);
    expect(result.coordinatorReasoning.actionPlan).toBeNull();
    expect(result.coordinatorReasoning.analysis).toContain("failed");
  });
});
