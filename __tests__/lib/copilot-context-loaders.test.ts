import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    situation: { findFirst: vi.fn() },
    initiative: { findFirst: vi.fn() },
    entity: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    executionStep: { findMany: vi.fn() },
    followUp: { findMany: vi.fn() },
    workStreamItem: { findFirst: vi.fn() },
    workStream: { findFirst: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/workstreams", () => ({
  getWorkStreamContext: vi.fn(),
  canMemberAccessWorkStream: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getWorkStreamContext } from "@/lib/workstreams";
import {
  loadSituationContext,
  loadInitiativeContext,
  loadWorkStreamContext,
  loadContextForCopilot,
  getContextRoleInstruction,
} from "@/lib/copilot-context-loaders";

const mockPrisma = prisma as unknown as {
  situation: { findFirst: ReturnType<typeof vi.fn> };
  initiative: { findFirst: ReturnType<typeof vi.fn> };
  entity: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  executionStep: { findMany: ReturnType<typeof vi.fn> };
  followUp: { findMany: ReturnType<typeof vi.fn> };
  workStreamItem: { findFirst: ReturnType<typeof vi.fn> };
  workStream: { findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

const mockGetWorkStreamContext = getWorkStreamContext as ReturnType<typeof vi.fn>;

const OP = "op1";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── loadSituationContext ─────────────────────────────────────────────────────

describe("loadSituationContext", () => {
  it("returns formatted string with all sections", async () => {
    mockPrisma.situation.findFirst.mockResolvedValue({
      id: "sit1",
      status: "proposed",
      severity: 0.8,
      confidence: 0.9,
      source: "detected",
      reasoning: JSON.stringify({
        analysis: "Invoice #4521 is 15 days overdue with no response to 2 reminders.",
        evidenceSummary: "Last payment was 45 days late. Customer has history of slow payments.",
        actionPlan: [
          { title: "Send escalation email", description: "Email the finance contact with urgency" },
          { title: "Create follow-up", description: "Set 3-day follow-up" },
        ],
        confidence: 0.85,
      }),
      proposedAction: null,
      createdAt: new Date("2026-03-15"),
      triggerEntityId: "ent1",
      situationType: { name: "Overdue Invoice", description: "Invoices past due date", autonomyLevel: "supervised" },
      executionPlan: {
        id: "plan1",
        status: "executing",
        currentStepOrder: 2,
        steps: [
          { title: "Send email", executionMode: "action", status: "completed", sequenceOrder: 1 },
          { title: "Create follow-up", executionMode: "generate", status: "executing", sequenceOrder: 2 },
        ],
      },
    });

    mockPrisma.entity.findUnique.mockResolvedValue({
      displayName: "Meridian Corp",
      entityType: { name: "Customer" },
      propertyValues: [
        { value: "meridian@example.com", property: { name: "Email" } },
        { value: "$12,500", property: { name: "Outstanding Amount" } },
      ],
    });

    mockPrisma.executionStep.findMany.mockResolvedValue([
      { id: "step1" }, { id: "step2" },
    ]);
    mockPrisma.followUp.findMany.mockResolvedValue([
      { status: "watching", triggerAt: new Date("2026-03-20") },
    ]);

    mockPrisma.workStreamItem.findFirst.mockResolvedValue({
      workStream: {
        title: "Q1 Collections",
        items: [
          { itemType: "situation", itemId: "sit1" },
          { itemType: "situation", itemId: "sit2" },
        ],
      },
    });

    const result = await loadSituationContext("sit1", OP);

    expect(result).not.toBeNull();
    expect(result).toContain("SITUATION CONTEXT:");
    expect(result).toContain("Overdue Invoice");
    expect(result).toContain("Meridian Corp");
    expect(result).toContain("Invoice #4521");
    expect(result).toContain("Send escalation email");
    expect(result).toContain("✓ Send email");
    expect(result).toContain("→ Create follow-up");
    expect(result).toContain("watching");
    expect(result).toContain("Q1 Collections");
  });

  it("returns valid context with no execution plan", async () => {
    mockPrisma.situation.findFirst.mockResolvedValue({
      id: "sit2",
      status: "detected",
      severity: 0.5,
      confidence: 0.7,
      source: "detected",
      reasoning: null,
      proposedAction: null,
      createdAt: new Date("2026-03-18"),
      triggerEntityId: null,
      situationType: { name: "Slow Response", description: "Slow email response", autonomyLevel: "supervised" },
      executionPlan: null,
    });
    mockPrisma.workStreamItem.findFirst.mockResolvedValue(null);

    const result = await loadSituationContext("sit2", OP);

    expect(result).not.toBeNull();
    expect(result).toContain("SITUATION CONTEXT:");
    expect(result).toContain("Slow Response");
    expect(result).toContain("detected");
    // Should not crash even without plan/reasoning/trigger
    expect(result).not.toContain("Execution Status");
    expect(result).not.toContain("AI Analysis");
  });

  it("returns null for non-existent situation", async () => {
    mockPrisma.situation.findFirst.mockResolvedValue(null);
    const result = await loadSituationContext("nonexistent", OP);
    expect(result).toBeNull();
  });
});

// ── loadInitiativeContext ────────────────────────────────────────────────────

describe("loadInitiativeContext", () => {
  it("returns formatted string with goal and plan", async () => {
    mockPrisma.initiative.findFirst.mockResolvedValue({
      id: "init1",
      status: "executing",
      rationale: "Automate invoice follow-up emails to reduce overdue payments by 30%",
      impactAssessment: "Expected to save 10 hours/week of manual follow-up work",
      aiEntityId: "aiEnt1",
      createdAt: new Date("2026-03-10"),
      goal: {
        title: "Reduce overdue invoices",
        description: "Bring overdue rate below 5%",
        priority: 2,
        deadline: new Date("2026-06-30"),
      },
      executionPlan: {
        id: "plan1",
        status: "executing",
        currentStepOrder: 1,
        steps: [
          { title: "Configure email template", executionMode: "generate", status: "completed", sequenceOrder: 1 },
          { title: "Send first batch", executionMode: "action", status: "pending", sequenceOrder: 2 },
        ],
      },
    });

    mockPrisma.entity.findUnique
      .mockResolvedValueOnce({ displayName: "Finance AI", parentDepartmentId: "dept1" })
      .mockResolvedValueOnce({ displayName: "Finance" });

    mockPrisma.workStreamItem.findFirst.mockResolvedValue({
      workStream: { title: "Finance Automation" },
    });

    const result = await loadInitiativeContext("init1", OP);

    expect(result).not.toBeNull();
    expect(result).toContain("INITIATIVE CONTEXT:");
    expect(result).toContain("executing");
    expect(result).toContain("Finance AI (Finance)");
    expect(result).toContain("Reduce overdue invoices");
    expect(result).toContain("Automate invoice follow-up");
    expect(result).toContain("✓ Configure email template");
    expect(result).toContain("○ Send first batch");
    expect(result).toContain("Finance Automation");
    expect(result).toContain("Impact Assessment");
  });
});

// ── loadWorkStreamContext ────────────────────────────────────────────────────

describe("loadWorkStreamContext", () => {
  it("returns formatted string with all items", async () => {
    mockPrisma.workStream.findFirst.mockResolvedValue({ id: "ws1" });
    mockGetWorkStreamContext.mockResolvedValue({
      id: "ws1",
      title: "Q1 Collections",
      description: "Track all overdue invoice follow-ups",
      status: "active",
      goal: { title: "Reduce overdue invoices" },
      items: [
        { type: "situation", id: "sit1", status: "proposed", summary: "Meridian Corp overdue" },
        { type: "initiative", id: "init1", status: "executing", summary: "Auto-follow-up emails" },
      ],
      parent: { title: "Finance Operations", id: "ws0", description: "", itemCount: 5 },
    });
    mockPrisma.workStream.count.mockResolvedValue(2);

    const result = await loadWorkStreamContext("ws1", OP);

    expect(result).not.toBeNull();
    expect(result).toContain("PROJECT CONTEXT:");
    expect(result).toContain("Q1 Collections");
    expect(result).toContain("Reduce overdue invoices");
    expect(result).toContain("📋 Meridian Corp overdue");
    expect(result).toContain("💡 Auto-follow-up emails");
    expect(result).toContain("Finance Operations");
    expect(result).toContain("Sub-projects: 2");
  });

  it("returns null for non-existent workstream", async () => {
    mockPrisma.workStream.findFirst.mockResolvedValue(null);
    const result = await loadWorkStreamContext("nonexistent", OP);
    expect(result).toBeNull();
  });
});

// ── getToolsForContext ───────────────────────────────────────────────────────

describe("getToolsForContext", () => {
  // Import from ai-copilot since that's where it lives
  let getToolsForContext: (contextType: string | null) => Array<{ name: string }>;

  beforeEach(async () => {
    // Dynamic import to get the exported function
    const mod = await import("@/lib/ai-copilot");
    getToolsForContext = mod.getToolsForContext;
  });

  it("returns all tools for null context", () => {
    const tools = getToolsForContext(null);
    const names = tools.map(t => t.name);
    expect(names).toContain("get_recurring_tasks");
    expect(names).toContain("create_situation_type");
    expect(names).toContain("list_departments");
    expect(names).toContain("get_org_structure");
  });

  it("situation context excludes recurring_tasks and create_situation_type", () => {
    const tools = getToolsForContext("situation");
    const names = tools.map(t => t.name);
    expect(names).not.toContain("get_recurring_tasks");
    expect(names).not.toContain("create_situation_type");
    expect(names).not.toContain("list_departments");
    expect(names).not.toContain("get_org_structure");
    // Should still include core tools
    expect(names).toContain("get_operational_briefing");
    expect(names).toContain("get_goals");
    expect(names).toContain("get_priorities");
    expect(names).toContain("lookup_entity");
  });

  it("initiative context also excludes get_delegations", () => {
    const tools = getToolsForContext("initiative");
    const names = tools.map(t => t.name);
    expect(names).not.toContain("get_delegations");
    expect(names).not.toContain("get_recurring_tasks");
    expect(names).toContain("get_goals");
    expect(names).toContain("get_initiatives");
  });
});

// ── Context injection integration ────────────────────────────────────────────

describe("loadContextForCopilot dispatcher", () => {
  it("dispatches to situation loader", async () => {
    mockPrisma.situation.findFirst.mockResolvedValue({
      id: "sit1", status: "detected", severity: 0.5, confidence: 0.5,
      source: "detected", reasoning: null, proposedAction: null,
      createdAt: new Date(), triggerEntityId: null,
      situationType: { name: "Test", description: "Test type", autonomyLevel: "supervised" },
      executionPlan: null,
    });
    mockPrisma.workStreamItem.findFirst.mockResolvedValue(null);

    const result = await loadContextForCopilot("situation", "sit1", OP);
    expect(result).toContain("SITUATION CONTEXT:");
  });

  it("returns null for unknown context type", async () => {
    const result = await loadContextForCopilot("unknown", "id1", OP);
    expect(result).toBeNull();
  });
});

describe("getContextRoleInstruction", () => {
  it("returns situation role instruction", () => {
    expect(getContextRoleInstruction("situation")).toContain("advising on this specific situation");
  });

  it("returns initiative role instruction", () => {
    expect(getContextRoleInstruction("initiative")).toContain("advising on this specific initiative");
  });

  it("returns workstream role instruction", () => {
    expect(getContextRoleInstruction("workstream")).toContain("advising on this project");
  });

  it("returns empty for unknown type", () => {
    expect(getContextRoleInstruction("unknown")).toBe("");
  });
});
