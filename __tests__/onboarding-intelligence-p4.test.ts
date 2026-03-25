import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Knowledge Analyst", () => {
  it("prompt is registered in prompt registry", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );
    const prompt = getAgentPrompt("knowledge_analyst");
    expect(prompt).toBeDefined();
    expect(prompt).toContain("Knowledge & Communication Analyst");
    expect(prompt).toContain("Knowledge Inventory");
    expect(prompt).toContain("Knowledge Bottleneck Detection");
    expect(prompt).toContain("vejledning"); // Danish keyword
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCIAL ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Financial Analyst", () => {
  it("prompt is registered in prompt registry", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );
    const prompt = getAgentPrompt("financial_analyst");
    expect(prompt).toBeDefined();
    expect(prompt).toContain("Financial & Performance Analyst");
    expect(prompt).toContain("Revenue & Financial Overview");
    expect(prompt).toContain("Correlation Discovery");
    expect(prompt).toContain("regnskab"); // Danish keyword
  });
});
