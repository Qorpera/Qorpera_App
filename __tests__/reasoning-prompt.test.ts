import { describe, it, expect } from "vitest";

import { buildReasoningSystemPrompt } from "@/lib/reasoning-prompts";
import { REASONING_PROMPT_VERSION } from "@/lib/reasoning-engine";

// ═══════════════════════════════════════════════════════════════════════════════

describe("Reasoning prompt structure", () => {
  const prompt = buildReasoningSystemPrompt("Test company makes widgets", "TestCo");

  it("data-first ordering — principles before output format", () => {
    const principleIdx = prompt.indexOf("CORE OPERATING PRINCIPLE");
    const outputIdx = prompt.indexOf("OUTPUT FORMAT");
    const rulesIdx = prompt.indexOf("CRITICAL RULES");

    expect(principleIdx).toBeGreaterThan(-1);
    expect(outputIdx).toBeGreaterThan(principleIdx);
    expect(rulesIdx).toBeGreaterThan(outputIdx);
  });

  it("contains quote-then-analyze directive", () => {
    expect(prompt).toContain("identify and quote the specific data points");
    expect(prompt).toContain("Reference each quoted piece of evidence by its source section");
    expect(prompt).toContain("insufficient data");
  });

  it("contains anti-sycophancy — independent analyst persona", () => {
    expect(prompt).toContain("independent operational analyst");
    expect(prompt).toContain("accuracy and honest assessment");
  });

  it("contains anti-sycophancy — explicit rejection permission", () => {
    expect(prompt).toContain("No action needed");
    expect(prompt).toContain("Insufficient data to act");
    expect(prompt).toContain("Monitor and reassess");
    expect(prompt).toContain("Do not force an action recommendation");
  });

  it("contains anti-sycophancy — devil's advocate on escalation", () => {
    expect(prompt).toContain("strongest argument against escalating");
    expect(prompt).toContain("deliberate, not reflexive");
  });
});

describe("REASONING_PROMPT_VERSION", () => {
  it("is incremented to 2", () => {
    expect(REASONING_PROMPT_VERSION).toBe(2);
  });
});

describe("Existing reasoning structure preserved", () => {
  const prompt = buildReasoningSystemPrompt(null, "Acme");

  it("still contains core operating principle", () => {
    expect(prompt).toContain("CORE OPERATING PRINCIPLE");
    expect(prompt).toContain("reason and act ONLY from the evidence provided");
  });

  it("still contains governance section", () => {
    expect(prompt).toContain("GOVERNANCE POLICIES ARE HARD BLOCKERS");
    expect(prompt).toContain("BLOCKED actions are forbidden");
  });

  it("still contains output format with required JSON fields", () => {
    expect(prompt).toContain("analysis");
    expect(prompt).toContain("evidenceSummary");
    expect(prompt).toContain("consideredActions");
    expect(prompt).toContain("actionPlan");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("missingContext");
    expect(prompt).toContain("escalation");
  });

  it("works without business context", () => {
    expect(prompt).not.toContain("BUSINESS CONTEXT");
    expect(prompt).toContain("independent operational analyst for Acme");
  });
});
