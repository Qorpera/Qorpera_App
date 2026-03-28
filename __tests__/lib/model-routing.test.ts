import { describe, it, expect } from "vitest";
import { getModel, getThinkingBudget } from "@/lib/ai-provider";

describe("onboarding model routing", () => {
  it("routes temporal analyst to Haiku", () => {
    expect(getModel("onboardingTemporal")).toContain("haiku");
  });

  it("routes R1 agents to Sonnet", () => {
    expect(getModel("onboardingAgent")).toContain("sonnet");
  });

  it("routes organizer to Opus", () => {
    expect(getModel("onboardingOrganizer")).toContain("opus");
  });

  it("routes synthesis to Sonnet", () => {
    expect(getModel("onboardingSynthesis")).toContain("sonnet");
  });

  it("has no thinking for temporal and extraction", () => {
    expect(getThinkingBudget("onboardingTemporal")).toBeNull();
    expect(getThinkingBudget("onboardingExtraction")).toBeNull();
  });

  it("has thinking budget for agents and organizer", () => {
    expect(getThinkingBudget("onboardingAgent")).toBeGreaterThan(0);
    expect(getThinkingBudget("onboardingOrganizer")).toBeGreaterThan(0);
    expect(getThinkingBudget("onboardingSynthesis")).toBeGreaterThan(0);
  });
});
