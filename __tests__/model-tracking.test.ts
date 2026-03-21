// Mock db for createExecutionPlan
const mockExecutionPlanCreate = vi.fn();
const mockExecutionStepCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => {
      return cb({
        executionPlan: { create: mockExecutionPlanCreate },
        executionStep: { create: mockExecutionStepCreate },
      });
    }),
  },
}));

// Mock dynamic import used by scorePlanOnCreate (fire-and-forget)
vi.mock("@/lib/prioritization-engine", () => ({
  computeSinglePlanPriority: vi.fn().mockResolvedValue(undefined),
}));

import { REASONING_PROMPT_VERSION } from "@/lib/reasoning-engine";
import { PLAN_REASONING_PROMPT_VERSION } from "@/lib/reasoning-prompts";
import { createExecutionPlan } from "@/lib/execution-engine";

beforeEach(() => {
  vi.clearAllMocks();
  mockExecutionPlanCreate.mockResolvedValue({ id: "plan-1" });
  mockExecutionStepCreate.mockResolvedValue({ id: "step-1" });
});

describe("model tracking", () => {
  it("REASONING_PROMPT_VERSION is a positive integer", () => {
    expect(REASONING_PROMPT_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(REASONING_PROMPT_VERSION)).toBe(true);
  });

  it("PLAN_REASONING_PROMPT_VERSION is a positive integer", () => {
    expect(PLAN_REASONING_PROMPT_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PLAN_REASONING_PROMPT_VERSION)).toBe(true);
  });

  it("createExecutionPlan persists modelId and promptVersion", async () => {
    await createExecutionPlan(
      "op1",
      "situation",
      "sit1",
      [{ title: "Step 1", description: "Do thing", executionMode: "human_task" }],
      { modelId: "gpt-4o", promptVersion: 1 },
    );

    expect(mockExecutionPlanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelId: "gpt-4o",
          promptVersion: 1,
        }),
      }),
    );
  });
});
