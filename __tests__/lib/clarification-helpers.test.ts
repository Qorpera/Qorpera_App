import { describe, it, expect } from "vitest";
import {
  renderDecisionsSection,
  renderOpenQuestionsSection,
  parseDecisionsSection,
  parseOpenQuestionsSection,
} from "@/lib/clarification-helpers";
import type { Decision, OpenQuestion } from "@/lib/deliberation-types";

describe("clarification-helpers round-trip", () => {
  const answered: Decision = {
    kind: "answered",
    id: "dec-xyz789",
    dimension: "Scope of follow-up memo",
    question: "Which framing matches the partners' current concern?",
    raisedAt: "2026-04-16T14:32:18Z",
    answeredAt: "2026-04-16T14:47:05Z",
    answeredByUserId: "jonas-madsen",
    answeredBySlug: "jonas-madsen",
    choice: "Operational risk framing",
    isCustomAnswer: false,
    affectedStepOrders: [1, 2],
    preferenceScope: { type: "situation_type", scopeSlug: "situation-type-pe-deal-memo" },
  };

  const autoApplied: Decision = {
    kind: "auto_applied",
    id: "dec-abc123",
    dimension: "Copy finance lead on reminder",
    choice: "CC louise-winther@qorpera.dk on the email",
    basis: "Learned preference — 5 of 5 prior, confidence 0.91",
    affectedStepOrders: [1],
    preferenceScope: { type: "person", scopeSlug: "person-simon-krogh" },
    preferenceId: "pref-abc123",
    confidenceAtApplication: 0.91,
    appliedAt: "2026-04-16T14:32:18Z",
  };

  const openQuestion: OpenQuestion = {
    id: "q-ghi789",
    dimension: "Scope of follow-up memo",
    question: "Which framing matches the partners' current concern?",
    options: [
      { label: "Operational risk framing", hint: "Lead with COO departure." },
      { label: "Market headwind framing", hint: "Lead with Q4 pipeline signals." },
    ],
    affectedStepOrders: [1, 2],
    preferenceScope: { type: "situation_type", scopeSlug: "situation-type-pe-deal-memo" },
    raisedAt: "2026-04-16T14:32:18Z",
    priorCustomAnswer: "Ops framing, include Q4 context in §3",
    materialityRationale: "(not persisted to wiki)",
  };

  it("renders and parses an answered decision symmetrically", () => {
    const rendered = renderDecisionsSection([answered]);
    const body = rendered.replace(/^## Decisions\n+/, "").trimEnd();
    const parsed = parseDecisionsSection(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: "answered",
      id: answered.id,
      dimension: answered.dimension,
      choice: answered.choice,
      isCustomAnswer: false,
      affectedStepOrders: [1, 2],
    });
  });

  it("renders and parses an auto-applied decision symmetrically", () => {
    const rendered = renderDecisionsSection([autoApplied]);
    const body = rendered.replace(/^## Decisions\n+/, "").trimEnd();
    const parsed = parseDecisionsSection(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: "auto_applied",
      id: autoApplied.id,
      dimension: autoApplied.dimension,
      choice: autoApplied.choice,
      preferenceId: autoApplied.preferenceId,
      confidenceAtApplication: 0.91,
    });
  });

  it("renders and parses mixed decisions in a single section", () => {
    const rendered = renderDecisionsSection([autoApplied, answered]);
    const body = rendered.replace(/^## Decisions\n+/, "").trimEnd();
    const parsed = parseDecisionsSection(body);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].kind).toBe("auto_applied");
    expect(parsed[1].kind).toBe("answered");
  });

  it("renders and parses an open question symmetrically", () => {
    const rendered = renderOpenQuestionsSection([openQuestion]);
    const body = rendered.replace(/^## Open Questions\n+/, "").trimEnd();
    const parsed = parseOpenQuestionsSection(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: openQuestion.id,
      dimension: openQuestion.dimension,
      question: openQuestion.question,
      affectedStepOrders: [1, 2],
      priorCustomAnswer: openQuestion.priorCustomAnswer,
    });
    expect(parsed[0].options).toHaveLength(2);
    expect(parsed[0].options[0].label).toBe("Operational risk framing");
  });

  it("renders empty sections as empty strings", () => {
    expect(renderDecisionsSection([])).toBe("");
    expect(renderOpenQuestionsSection([])).toBe("");
  });

  it("parses empty section body as empty arrays", () => {
    expect(parseDecisionsSection("")).toEqual([]);
    expect(parseOpenQuestionsSection("")).toEqual([]);
  });

  it("parser skips malformed blocks without throwing", () => {
    const malformed = `### Orphan block with no fields

### Another orphan
**Tag:** invalid-tag
**Choice:** something`;
    expect(parseDecisionsSection(malformed)).toEqual([]);
  });
});
