import { describe, it, expect } from "vitest";
import {
  computeUpdatedPreference,
  meetsAutoApplyThreshold,
  buildPreferenceId,
  slugify,
  renderLearnedPreferencesSection,
  parseLearnedPreferencesSection,
} from "@/lib/learned-preferences";
import type { LearnedPreference } from "@/lib/deliberation-types";

const scope = { type: "person" as const, scopeSlug: "person-simon-krogh" };
const id = "pref-tone-of-reminders-person-simon-krogh";

describe("slugify + buildPreferenceId", () => {
  it("slugifies strings", () => {
    expect(slugify("Tone of Reminders!")).toBe("tone-of-reminders");
    expect(slugify("  Multi  Space ")).toBe("multi-space");
    expect(slugify("CC the CFO?")).toBe("cc-the-cfo");
  });

  it("builds deterministic preference IDs", () => {
    expect(buildPreferenceId("Tone of Reminders", "person-simon-krogh")).toBe("pref-tone-of-reminders-person-simon-krogh");
  });
});

describe("computeUpdatedPreference — first decision", () => {
  it("seeds confidence 0.5 for option-based first decision", () => {
    const result = computeUpdatedPreference(
      null,
      { choice: "Routine", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: false },
      id, "Tone", scope,
    );
    expect(result.confidence).toBe(0.5);
    expect(result.recencyWeightedSample).toBe(1.0);
    expect(result.preferredChoice).toBe("Routine");
    expect(result.priorCustomAnswers).toEqual([]);
    expect(result.history).toHaveLength(1);
  });

  it("seeds confidence 0.3 for custom-answer first decision", () => {
    const result = computeUpdatedPreference(
      null,
      { choice: "Custom thing", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: true },
      id, "Tone", scope,
    );
    expect(result.confidence).toBe(0.3);
    expect(result.recencyWeightedSample).toBe(0.5);
    expect(result.priorCustomAnswers).toEqual(["Custom thing"]);
  });
});

describe("computeUpdatedPreference — custom answers don't train", () => {
  it("preserves confidence when a custom answer arrives", () => {
    const existing: LearnedPreference = {
      id, dimension: "Tone", scope,
      preferredChoice: "Routine",
      confidence: 0.75,
      recencyWeightedSample: 3.2,
      lastUpdatedAt: "2026-04-01T12:00:00Z",
      priorCustomAnswers: [],
      history: [{ choice: "Routine", timestamp: "2026-04-01T12:00:00Z", isCustomAnswer: false }],
    };
    const result = computeUpdatedPreference(
      existing,
      { choice: "Something custom", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: true },
      id, "Tone", scope,
    );
    expect(result.confidence).toBe(0.75);
    expect(result.recencyWeightedSample).toBe(3.2);
    expect(result.preferredChoice).toBe("Routine");
    expect(result.priorCustomAnswers).toEqual(["Something custom"]);
  });

  it("dedupes repeated custom answers and caps at 5", () => {
    const existing: LearnedPreference = {
      id, dimension: "Tone", scope,
      preferredChoice: "Routine", confidence: 0.75, recencyWeightedSample: 3.2,
      lastUpdatedAt: "2026-04-01T12:00:00Z",
      priorCustomAnswers: ["a", "b", "c", "d", "e"],
      history: [{ choice: "Routine", timestamp: "2026-04-01T12:00:00Z", isCustomAnswer: false }],
    };
    const result = computeUpdatedPreference(
      existing,
      { choice: "a", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: true },
      id, "Tone", scope,
    );
    expect(result.priorCustomAnswers).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("computeUpdatedPreference — EMA update on agreeing decision", () => {
  it("increases confidence when new decision agrees with preferred", () => {
    const existing: LearnedPreference = {
      id, dimension: "Tone", scope,
      preferredChoice: "Routine",
      confidence: 0.5,
      recencyWeightedSample: 1.0,
      lastUpdatedAt: "2026-04-15T12:00:00Z",
      priorCustomAnswers: [],
      history: [{ choice: "Routine", timestamp: "2026-04-15T12:00:00Z", isCustomAnswer: false }],
    };
    const result = computeUpdatedPreference(
      existing,
      { choice: "Routine", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: false },
      id, "Tone", scope,
    );
    // median_prior_age ≈ 1 day → decay_buckets = 0 → alpha = 0.3
    // new_confidence = 0.3 * 1.0 + 0.7 * 0.5 = 0.65
    expect(result.confidence).toBeCloseTo(0.65, 2);
    expect(result.preferredChoice).toBe("Routine");
    expect(result.recencyWeightedSample).toBeGreaterThan(1.0);
  });
});

describe("computeUpdatedPreference — disagreeing decision flips preferred choice", () => {
  it("flips preferred choice when weighted support favors the new choice", () => {
    const existing: LearnedPreference = {
      id, dimension: "Tone", scope,
      preferredChoice: "Routine",
      confidence: 0.6,
      recencyWeightedSample: 2.0,
      lastUpdatedAt: "2026-02-01T12:00:00Z",
      priorCustomAnswers: [],
      history: [
        { choice: "Routine", timestamp: "2026-02-01T12:00:00Z", isCustomAnswer: false },
        { choice: "Routine", timestamp: "2026-01-01T12:00:00Z", isCustomAnswer: false },
      ],
    };
    const result = computeUpdatedPreference(
      existing,
      { choice: "Explicit", timestamp: "2026-04-16T12:00:00Z", isCustomAnswer: false },
      id, "Tone", scope,
    );
    // new "Explicit" decision is very recent (weight ≈ 1.0)
    // old "Routine" decisions decayed (~75 and ~105 days old → weights ≈ 0.43 and 0.31)
    // sum routine ≈ 0.74, sum explicit ≈ 1.0 → preferred flips
    expect(result.preferredChoice).toBe("Explicit");
    expect(result.confidence).toBeLessThan(existing.confidence);
  });
});

describe("meetsAutoApplyThreshold", () => {
  const base: LearnedPreference = {
    id, dimension: "Tone", scope,
    preferredChoice: "Routine",
    confidence: 0.85,
    recencyWeightedSample: 6.0,
    lastUpdatedAt: "2026-04-10T12:00:00Z",
    priorCustomAnswers: [],
    history: [{ choice: "Routine", timestamp: "2026-04-10T12:00:00Z", isCustomAnswer: false }],
  };

  it("auto-applies when all thresholds met", () => {
    expect(meetsAutoApplyThreshold(base, "2026-04-16T12:00:00Z")).toBe(true);
  });

  it("rejects when confidence below 0.8", () => {
    expect(meetsAutoApplyThreshold({ ...base, confidence: 0.75 }, "2026-04-16T12:00:00Z")).toBe(false);
  });

  it("rejects when recency-weighted sample below 5.0", () => {
    expect(meetsAutoApplyThreshold({ ...base, recencyWeightedSample: 4.9 }, "2026-04-16T12:00:00Z")).toBe(false);
  });

  it("rejects when most recent decision older than 60 days", () => {
    expect(meetsAutoApplyThreshold(base, "2026-07-01T12:00:00Z")).toBe(false);
  });
});

describe("render/parse round-trip", () => {
  it("round-trips a non-trivial preference", () => {
    const pref: LearnedPreference = {
      id,
      dimension: "Tone of reminders",
      scope,
      preferredChoice: "Routine administrative follow-up",
      confidence: 0.88,
      recencyWeightedSample: 4.72,
      lastUpdatedAt: "2026-04-16T14:32:18Z",
      priorCustomAnswers: ["alt answer one", "alt answer two"],
      history: [
        { choice: "Routine administrative follow-up", timestamp: "2026-04-16T14:32:18Z", isCustomAnswer: false },
        { choice: "Routine administrative follow-up", timestamp: "2026-04-02T10:11:00Z", isCustomAnswer: false },
      ],
    };
    const rendered = renderLearnedPreferencesSection([pref]);
    const body = rendered.replace(/^## Learned Preferences\n+/, "").trimEnd();
    const parsed = parseLearnedPreferencesSection(body, scope);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(pref.id);
    expect(parsed[0].preferredChoice).toBe(pref.preferredChoice);
    expect(parsed[0].confidence).toBeCloseTo(pref.confidence, 2);
    expect(parsed[0].priorCustomAnswers).toEqual(pref.priorCustomAnswers);
    expect(parsed[0].history).toHaveLength(2);
  });
});
