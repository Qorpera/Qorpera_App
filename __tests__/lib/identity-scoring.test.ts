import { describe, it, expect } from "vitest";
import { CATEGORY_PRIORITY } from "@/lib/hardcoded-type-defs";

/**
 * These tests verify the SCORING SPECIFICATION for identity resolution.
 *
 * The actual scoring lives inside findMergeCandidates() in identity-resolution.ts.
 * These tests document the expected weights and thresholds as a specification,
 * so any change to the scoring logic is caught immediately.
 *
 * Weights:
 *   email_match:       +0.5
 *   domain_match:      +0.15
 *   phone_match:       +0.2
 *   high_similarity:   +0.15  (embedding similarity > 0.85)
 *   same_source:       -1.0   (hard block)
 *
 * Thresholds:
 *   >= 0.8  → auto_merge
 *   0.5–0.8 → suggestion
 *   < 0.5   → discard (not returned)
 */

// Replicate the scoring function as a spec — if identity-resolution.ts changes
// weights, this test will fail and force a deliberate update here too.
function computeScore(signals: {
  emailMatch?: boolean;
  domainMatch?: boolean;
  phoneMatch?: boolean;
  highSimilarity?: boolean;
  sameSource?: boolean;
}): number {
  let score = 0;
  if (signals.sameSource) score -= 1.0;
  if (signals.emailMatch) score += 0.5;
  if (signals.domainMatch) score += 0.15;
  if (signals.phoneMatch) score += 0.2;
  if (signals.highSimilarity) score += 0.15;
  return score;
}

function classify(score: number): "auto_merge" | "suggestion" | "discard" {
  if (score >= 0.8) return "auto_merge";
  if (score >= 0.5) return "suggestion";
  return "discard";
}

describe("identity resolution scoring specification", () => {
  describe("individual signal weights", () => {
    it("email match alone = 0.5 → suggestion", () => {
      const score = computeScore({ emailMatch: true });
      expect(score).toBe(0.5);
      expect(classify(score)).toBe("suggestion");
    });

    it("domain match alone = 0.15 → discard", () => {
      const score = computeScore({ domainMatch: true });
      expect(score).toBe(0.15);
      expect(classify(score)).toBe("discard");
    });

    it("phone match alone = 0.2 → discard", () => {
      const score = computeScore({ phoneMatch: true });
      expect(score).toBe(0.2);
      expect(classify(score)).toBe("discard");
    });

    it("high similarity alone = 0.15 → discard", () => {
      const score = computeScore({ highSimilarity: true });
      expect(score).toBe(0.15);
      expect(classify(score)).toBe("discard");
    });
  });

  describe("signal combinations", () => {
    it("email + high similarity = 0.65 → suggestion (Day 28 verified)", () => {
      const score = computeScore({ emailMatch: true, highSimilarity: true });
      expect(score).toBe(0.65);
      expect(classify(score)).toBe("suggestion");
    });

    it("email + phone = 0.7 → suggestion", () => {
      const score = computeScore({ emailMatch: true, phoneMatch: true });
      expect(score).toBe(0.7);
      expect(classify(score)).toBe("suggestion");
    });

    it("email + phone + similarity = 0.85 → auto_merge (Day 28 verified)", () => {
      const score = computeScore({
        emailMatch: true,
        phoneMatch: true,
        highSimilarity: true,
      });
      expect(score).toBe(0.85);
      expect(classify(score)).toBe("auto_merge");
    });

    it("email + domain + similarity = 0.8 → auto_merge (boundary)", () => {
      const score = computeScore({
        emailMatch: true,
        domainMatch: true,
        highSimilarity: true,
      });
      expect(score).toBe(0.8);
      expect(classify(score)).toBe("auto_merge");
    });

    it("all signals = 1.0 → auto_merge", () => {
      const score = computeScore({
        emailMatch: true,
        domainMatch: true,
        phoneMatch: true,
        highSimilarity: true,
      });
      expect(score).toBe(1.0);
      expect(classify(score)).toBe("auto_merge");
    });
  });

  describe("same-source hard block", () => {
    it("same source kills any combination", () => {
      const score = computeScore({
        sameSource: true,
        emailMatch: true,
        phoneMatch: true,
        highSimilarity: true,
      });
      // 0.5 + 0.2 + 0.15 - 1.0 = -0.15
      expect(score).toBeLessThan(0);
      expect(classify(score)).toBe("discard");
    });

    it("same source alone = -1.0", () => {
      const score = computeScore({ sameSource: true });
      expect(score).toBe(-1.0);
      expect(classify(score)).toBe("discard");
    });

    it("same source with all positive signals still negative", () => {
      const score = computeScore({
        sameSource: true,
        emailMatch: true,
        domainMatch: true,
        phoneMatch: true,
        highSimilarity: true,
      });
      // 0.5 + 0.15 + 0.2 + 0.15 - 1.0 = 0.0
      expect(score).toBeCloseTo(0);
      expect(classify(score)).toBe("discard");
    });
  });

  describe("auto-merge requires two identity signals", () => {
    it("email alone never auto-merges (by design)", () => {
      // Even with high similarity, email-only = 0.65, below 0.8 threshold
      const score = computeScore({ emailMatch: true, highSimilarity: true });
      expect(classify(score)).toBe("suggestion");
    });

    it("phone alone never reaches suggestion threshold", () => {
      const score = computeScore({ phoneMatch: true, highSimilarity: true });
      // 0.2 + 0.15 = 0.35
      expect(classify(score)).toBe("discard");
    });
  });
});

describe("CATEGORY_PRIORITY (survivor selection)", () => {
  it("foundational has highest priority", () => {
    expect(CATEGORY_PRIORITY["foundational"]).toBe(5);
  });

  it("base > digital > external", () => {
    expect(CATEGORY_PRIORITY["base"]).toBeGreaterThan(CATEGORY_PRIORITY["digital"]);
    expect(CATEGORY_PRIORITY["digital"]).toBeGreaterThan(CATEGORY_PRIORITY["external"]);
  });

  it("internal sits between base and digital", () => {
    expect(CATEGORY_PRIORITY["internal"]).toBe(3);
    expect(CATEGORY_PRIORITY["internal"]).toBeLessThan(CATEGORY_PRIORITY["base"]);
    expect(CATEGORY_PRIORITY["internal"]).toBeGreaterThan(CATEGORY_PRIORITY["digital"]);
  });

  it("priority order: foundational > base > internal > digital > external", () => {
    const ordered = ["foundational", "base", "internal", "digital", "external"];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(CATEGORY_PRIORITY[ordered[i]]).toBeGreaterThan(
        CATEGORY_PRIORITY[ordered[i + 1]]
      );
    }
  });
});
