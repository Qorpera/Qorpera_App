import { describe, it, expect, vi } from "vitest";

// Mock prisma — policy-evaluator.ts imports it at top level but getEffectiveAutonomy is pure
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { getEffectiveAutonomy } from "@/lib/policy-evaluator";
import type { PolicyEvaluationResult } from "@/lib/policy-evaluator";

function makePolicyResult(overrides: Partial<PolicyEvaluationResult> = {}): PolicyEvaluationResult {
  return {
    permitted: [],
    blocked: [],
    hasRequireApproval: false,
    ...overrides,
  };
}

describe("getEffectiveAutonomy", () => {
  it("supervised always stays supervised regardless of policy", () => {
    const situation = { autonomyLevel: "supervised" };

    expect(getEffectiveAutonomy(situation, makePolicyResult())).toBe("supervised");
    expect(
      getEffectiveAutonomy(situation, makePolicyResult({ hasRequireApproval: true }))
    ).toBe("supervised");
  });

  it("notify stays notify when no REQUIRE_APPROVAL policy", () => {
    const situation = { autonomyLevel: "notify" };
    const result = getEffectiveAutonomy(situation, makePolicyResult());
    expect(result).toBe("notify");
  });

  it("notify downgrades to supervised when REQUIRE_APPROVAL policy matches", () => {
    const situation = { autonomyLevel: "notify" };
    const result = getEffectiveAutonomy(
      situation,
      makePolicyResult({ hasRequireApproval: true })
    );
    expect(result).toBe("supervised");
  });

  it("autonomous stays autonomous when no REQUIRE_APPROVAL policy", () => {
    const situation = { autonomyLevel: "autonomous" };
    const result = getEffectiveAutonomy(situation, makePolicyResult());
    expect(result).toBe("autonomous");
  });

  it("autonomous downgrades to supervised when REQUIRE_APPROVAL policy matches", () => {
    const situation = { autonomyLevel: "autonomous" };
    const result = getEffectiveAutonomy(
      situation,
      makePolicyResult({ hasRequireApproval: true })
    );
    expect(result).toBe("supervised");
  });

  it("blocked actions don't affect autonomy level (only REQUIRE_APPROVAL does)", () => {
    const situation = { autonomyLevel: "autonomous" };
    const result = getEffectiveAutonomy(
      situation,
      makePolicyResult({
        blocked: [{ name: "send_email", reason: "Global email block" }],
        hasRequireApproval: false,
      })
    );
    // Blocked actions are removed from execution, but autonomy level doesn't change
    expect(result).toBe("autonomous");
  });
});
