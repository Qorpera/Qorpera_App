import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma and ai-provider before importing deliberation-pass
vi.mock("@/lib/db", () => ({
  prisma: {
    knowledgePage: { findFirst: vi.fn() },
    operator: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-provider")>("@/lib/ai-provider");
  return {
    ...actual,
    callLLM: vi.fn(),
  };
});

vi.mock("@/lib/wiki-engine", () => ({
  resolvePageSlug: vi.fn().mockResolvedValue(null),
  updatePageWithLock: vi.fn(),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/context-assembly", () => ({
  loadCommunicationContext: vi.fn().mockResolvedValue({ excerpts: [] }),
}));

vi.mock("@/lib/worker-dispatch", () => ({
  enqueueWorkerJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/learned-preferences", () => ({
  readLearnedPreferences: vi.fn().mockResolvedValue([]),
  recordDecision: vi.fn().mockResolvedValue(undefined),
  meetsAutoApplyThreshold: vi.fn().mockReturnValue(false),
  buildPreferenceId: (d: string, s: string) => `pref-${d}-${s}`,
}));

import { runDeliberationPass } from "@/lib/deliberation-pass";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { readLearnedPreferences, meetsAutoApplyThreshold } from "@/lib/learned-preferences";

const SITUATION_PAGE_FIXTURE = {
  title: "Invoice INV-2024-094 overdue",
  content: `# Invoice INV-2024-094 overdue

## Trigger
Invoice is 8 days overdue.

## Context
Aarhus Creative Hub invoice.

## Action Plan

1. **Send payment reminder** (api_action → pending)
   Draft the reminder email to Simon.
   [capability: send_email]
   [params: {"to":"simon@aarhuscreative.dk","subject":"Reminder","body":"Hi Simon, just a reminder about INV-2024-094 which is 8 days overdue. Thanks."}]
   [preview: email]

2. **Update CRM status** (api_action → pending)
   Mark as overdue.
   [capability: crm_update]
   [params: {"entityId":"placeholder","updates":{"payment_status":"overdue"}}]

3. **Notify finance team** (api_action → pending)
   Slack the team.
   [capability: send_slack_message]
   [params: {"channel":"#økonomi","message":"INV-2024-094 is 8 days overdue, reminder sent to Simon."}]
`,
  properties: {
    situation_type: "situation-type-late-invoice",
  },
};

beforeEach(() => {
  vi.clearAllMocks();

  (vi.mocked(prisma.knowledgePage.findFirst) as unknown as { mockImplementation: (fn: (args: unknown) => Promise<unknown>) => void }).mockImplementation(async (args: unknown) => {
    const where = (args as { where: { pageType?: string } }).where;
    if (where.pageType === "situation_instance") {
      return {
        content: SITUATION_PAGE_FIXTURE.content,
        title: SITUATION_PAGE_FIXTURE.title,
        properties: SITUATION_PAGE_FIXTURE.properties,
      };
    }
    if (where.pageType === "situation_type_playbook") {
      return { title: "Late Invoice", content: "## Situation type\n\nDetails." };
    }
    return null;
  });

  vi.mocked(prisma.operator.findUnique).mockResolvedValue({ companyName: "Qorpera" } as never);

  vi.mocked(updatePageWithLock).mockImplementation(async (_operatorId, _slug, fn) => {
    fn({
      id: "page-1",
      slug: "sit-invoice",
      content: SITUATION_PAGE_FIXTURE.content,
      properties: SITUATION_PAGE_FIXTURE.properties,
      version: 1,
      activityContent: null,
      title: SITUATION_PAGE_FIXTURE.title,
      pageType: "situation_instance",
    });
    return {} as never;
  });

  // Reset default meetsAutoApplyThreshold to false
  vi.mocked(meetsAutoApplyThreshold).mockReturnValue(false);
  vi.mocked(readLearnedPreferences).mockResolvedValue([]);
});

describe("runDeliberationPass", () => {
  it("scenario 1: no forks → no open questions, all eligible steps refined", async () => {
    vi.mocked(callLLM)
      // Fork identification returns zero forks
      .mockResolvedValueOnce({ text: `{"forks":[]}`, apiCostCents: 5 } as never)
      // Draft refinement
      .mockResolvedValueOnce({
        text: JSON.stringify({
          refinedSteps: [
            { order: 1, params: { to: "simon@aarhuscreative.dk", subject: "Påmindelse", body: "Kære Simon, en hurtig påmindelse..." } },
            { order: 3, params: { channel: "#økonomi", message: "Refined slack" } },
          ],
        }),
        apiCostCents: 10,
      } as never);

    const result = await runDeliberationPass("op-1", "sit-invoice");
    expect(result).not.toBeNull();
    expect(result!.openQuestions).toHaveLength(0);
    expect(result!.autoAppliedDecisions).toHaveLength(0);
    expect(result!.awaitingStepOrders).toHaveLength(0);
    expect(result!.refinedStepOrders).toContain(1);
    expect(result!.refinedStepOrders).toContain(3);
  });

  it("scenario 2: 1 fork, no matching preference → raised as question, dependent step blocked", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          forks: [{
            id: "fork-1",
            dimension: "Tone of reminder",
            question: "Routine or escalating?",
            options: [
              { label: "Routine administrative", hint: "Simon has paid on time before" },
              { label: "Escalating concern", hint: "Overdue signals a shift" },
            ],
            affectedStepOrders: [1],
            preferenceScope: { type: "person", scopeSlug: "simon-krogh" },
            materialityRationale: "Tone affects Simon's response calibration",
          }],
        }),
        apiCostCents: 5,
      } as never)
      // Refinement for non-blocked steps (2, 3) only
      .mockResolvedValueOnce({
        text: JSON.stringify({
          refinedSteps: [
            { order: 3, params: { channel: "#økonomi", message: "Refined slack" } },
          ],
        }),
        apiCostCents: 10,
      } as never);

    const result = await runDeliberationPass("op-1", "sit-invoice");
    expect(result!.openQuestions).toHaveLength(1);
    expect(result!.awaitingStepOrders).toEqual([1]);
    expect(result!.refinedStepOrders).not.toContain(1);
  });

  it("scenario 3: 1 fork with high-confidence matching preference → auto-applied", async () => {
    vi.mocked(readLearnedPreferences).mockResolvedValue([{
      id: "pref-abc",
      dimension: "Tone of reminder",
      scope: { type: "person", scopeSlug: "simon-krogh" },
      preferredChoice: "Routine administrative",
      confidence: 0.92,
      recencyWeightedSample: 6.2,
      lastUpdatedAt: new Date().toISOString(),
      priorCustomAnswers: [],
      history: [{ choice: "Routine administrative", timestamp: new Date().toISOString(), isCustomAnswer: false }],
    }]);
    vi.mocked(meetsAutoApplyThreshold).mockReturnValue(true);

    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          forks: [{
            id: "fork-1",
            dimension: "Tone of reminder",
            question: "Routine or escalating?",
            options: [
              { label: "Routine administrative", hint: "Simon has paid on time before" },
              { label: "Escalating concern", hint: "Overdue signals a shift" },
            ],
            affectedStepOrders: [1],
            preferenceScope: { type: "person", scopeSlug: "simon-krogh" },
            materialityRationale: "Tone affects Simon's response",
          }],
        }),
        apiCostCents: 5,
      } as never)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          refinedSteps: [
            { order: 1, params: { to: "simon@aarhuscreative.dk", body: "Refined with routine tone" } },
            { order: 3, params: { channel: "#økonomi", message: "Refined slack" } },
          ],
        }),
        apiCostCents: 10,
      } as never);

    const result = await runDeliberationPass("op-1", "sit-invoice");
    expect(result!.openQuestions).toHaveLength(0);
    expect(result!.autoAppliedDecisions).toHaveLength(1);
    expect(result!.autoAppliedDecisions[0].choice).toBe("Routine administrative");
    expect(result!.awaitingStepOrders).toHaveLength(0);
  });

  it("scenario 4: 3 forks → 2 raised, 3rd capped and silently applied", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          forks: [
            { id: "fork-1", dimension: "Dim1", question: "Question one for fork one?", options: [{label:"A1",hint:"x pick this if x"},{label:"B1",hint:"y pick this if y"}], affectedStepOrders: [1], preferenceScope: { type: "person", scopeSlug: "simon-krogh" }, materialityRationale: "r1 rationale explanation" },
            { id: "fork-2", dimension: "Dim2", question: "Question two for fork two?", options: [{label:"A2",hint:"x pick this if x"},{label:"B2",hint:"y pick this if y"}], affectedStepOrders: [2], preferenceScope: { type: "person", scopeSlug: "simon-krogh" }, materialityRationale: "r2 rationale explanation" },
            { id: "fork-3", dimension: "Dim3", question: "Question three for fork three?", options: [{label:"A3",hint:"x pick this if x"},{label:"B3",hint:"y pick this if y"}], affectedStepOrders: [3], preferenceScope: { type: "person", scopeSlug: "simon-krogh" }, materialityRationale: "r3 rationale explanation" },
          ],
        }),
        apiCostCents: 5,
      } as never)
      .mockResolvedValueOnce({
        text: JSON.stringify({ refinedSteps: [{ order: 3, params: { channel: "#økonomi", message: "Capped → default applied" } }] }),
        apiCostCents: 10,
      } as never);

    const result = await runDeliberationPass("op-1", "sit-invoice");
    expect(result!.openQuestions).toHaveLength(2);
    expect(result!.autoAppliedDecisions).toHaveLength(1);
    expect(result!.autoAppliedDecisions[0].basis).toContain("Clarification cap reached");
  });
});
