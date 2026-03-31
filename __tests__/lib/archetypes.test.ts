import { describe, it, expect } from "vitest";
import { ARCHETYPES } from "../../scripts/seed-archetypes";

const VALID_CATEGORIES = [
  "payment_financial",
  "sales_pipeline",
  "client_communication",
  "people_hr",
  "operations_delivery",
  "knowledge_governance",
];

const VALID_SEVERITIES = ["low", "medium", "high"];

describe("Situation Archetypes seed data", () => {
  it("contains 29 archetypes with unique slugs", () => {
    expect(ARCHETYPES).toHaveLength(29);
    const slugs = ARCHETYPES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(29);
  });

  it("all archetypes have valid categories", () => {
    for (const a of ARCHETYPES) {
      expect(VALID_CATEGORIES).toContain(a.category);
    }
  });

  it("all archetypes have valid defaultSeverity", () => {
    for (const a of ARCHETYPES) {
      expect(VALID_SEVERITIES).toContain(a.defaultSeverity);
    }
  });

  it("all detectionTemplates are valid JSON objects with a mode field", () => {
    for (const a of ARCHETYPES) {
      expect(a.detectionTemplate).toBeDefined();
      const json = JSON.parse(JSON.stringify(a.detectionTemplate));
      expect(json).toHaveProperty("mode");
      expect(typeof json.mode).toBe("string");
    }
  });

  it("all examplePhrases are arrays with at least 3 entries", () => {
    for (const a of ARCHETYPES) {
      expect(Array.isArray(a.examplePhrases)).toBe(true);
      expect(a.examplePhrases.length).toBeGreaterThanOrEqual(3);
    }
  });
});
