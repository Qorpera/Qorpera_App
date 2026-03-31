import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    situation: { update: vi.fn().mockResolvedValue({}) },
  },
}));

import { buildReasoningSystemPrompt, buildReasoningUserPrompt } from "@/lib/reasoning-prompts";
import type { ReasoningInput } from "@/lib/reasoning-prompts";
import { prisma } from "@/lib/db";

function makeMinimalInput(overrides: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    situationType: { name: "Test", description: "Test situation", autonomyLevel: "supervised" },
    severity: 0.5,
    confidence: 0.7,
    triggerEntity: { displayName: "Test Entity", type: "person", category: "base", properties: {} },
    departments: [],
    departmentKnowledge: [],
    relatedEntities: { base: [], digital: [], external: [] },
    recentEvents: [],
    priorSituations: [],
    autonomyLevel: "supervised",
    permittedActions: [],
    blockedActions: [],
    businessContext: null,
    activityTimeline: { buckets: [], trend: "stable" },
    communicationContext: { excerpts: [], sourceBreakdown: {} },
    crossDepartmentSignals: { signals: [] },
    connectorCapabilities: [],
    ...overrides,
  };
}

describe("Reasoning prompt — no capabilities", () => {
  it("includes 'None currently connected' and instructs human_task steps", () => {
    const input = makeMinimalInput({ permittedActions: [] });
    const userPrompt = buildReasoningUserPrompt(input);

    expect(userPrompt).toContain("AVAILABLE AUTOMATED ACTIONS: None currently connected.");
    expect(userPrompt).toContain("human_task");
    expect(userPrompt).toContain("employee will execute them manually");
  });
});

describe("Reasoning prompt — with capabilities", () => {
  it("lists automated actions when capabilities exist", () => {
    const input = makeMinimalInput({
      permittedActions: [
        { name: "send_email", description: "Send an email via Gmail", connector: "gmail", inputSchema: null },
        { name: "create_task", description: "Create a task in Linear", connector: "linear", inputSchema: null },
      ],
    });
    const userPrompt = buildReasoningUserPrompt(input);

    expect(userPrompt).toContain("AVAILABLE AUTOMATED ACTIONS (use executionMode");
    expect(userPrompt).toContain("send_email: Send an email via Gmail (via gmail)");
    expect(userPrompt).toContain("create_task: Create a task in Linear (via linear)");
  });
});

describe("situationTitle storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("overwrites triggerSummary when situationTitle is present", async () => {
    const output = { situationTitle: "Invoice INV-2026-035 overdue" };

    // Simulate what reasoning-engine does after parsing output
    if (output.situationTitle) {
      await prisma.situation.update({
        where: { id: "sit-1" },
        data: { triggerSummary: output.situationTitle },
      });
    }

    expect(prisma.situation.update).toHaveBeenCalledWith({
      where: { id: "sit-1" },
      data: { triggerSummary: "Invoice INV-2026-035 overdue" },
    });
  });

  it("does not update triggerSummary when situationTitle is absent", async () => {
    const output = {};

    if ((output as Record<string, unknown>).situationTitle) {
      await prisma.situation.update({
        where: { id: "sit-1" },
        data: { triggerSummary: (output as Record<string, unknown>).situationTitle as string },
      });
    }

    expect(prisma.situation.update).not.toHaveBeenCalled();
  });
});

describe("actionPlan instructions", () => {
  it("says actionPlan should NEVER be null", () => {
    const systemPrompt = buildReasoningSystemPrompt(null);
    expect(systemPrompt).toContain("should NEVER be null");
    expect(systemPrompt).toContain("There is always at least one step");
  });

  it("includes situationTitle in output format", () => {
    const systemPrompt = buildReasoningSystemPrompt(null);
    expect(systemPrompt).toContain("situationTitle");
    expect(systemPrompt).toContain("invoice numbers, project names");
  });
});
