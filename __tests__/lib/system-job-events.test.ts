import { describe, it, expect } from "vitest";
import { matchesFilter, isKnownEventType } from "@/lib/system-job-events";

describe("matchesFilter", () => {
  it("null/undefined filter matches anything", () => {
    expect(matchesFilter(null, { foo: "bar" })).toBe(true);
    expect(matchesFilter(undefined, { foo: "bar" })).toBe(true);
  });

  it("empty object filter matches anything", () => {
    expect(matchesFilter({}, { foo: "bar" })).toBe(true);
  });

  it("array-as-filter is malformed → match nothing", () => {
    // typeof [] === "object" but arrays aren't valid filter maps
    expect(matchesFilter([] as unknown as Record<string, unknown>, { foo: "bar" })).toBe(false);
  });

  it("non-object filter is malformed → match nothing", () => {
    expect(matchesFilter("bad" as unknown as Record<string, unknown>, { foo: "bar" })).toBe(false);
  });

  it("primitive shorthand = equality", () => {
    expect(matchesFilter({ domain: "sales" }, { domain: "sales" })).toBe(true);
    expect(matchesFilter({ domain: "sales" }, { domain: "marketing" })).toBe(false);
    expect(matchesFilter({ severity: 0.5 }, { severity: 0.5 })).toBe(true);
    expect(matchesFilter({ severity: 0.5 }, { severity: 0.7 })).toBe(false);
    expect(matchesFilter({ flag: true }, { flag: true })).toBe(true);
    expect(matchesFilter({ flag: true }, { flag: false })).toBe(false);
  });

  it("op gte", () => {
    expect(matchesFilter({ severity: { op: "gte", value: 0.5 } }, { severity: 0.8 })).toBe(true);
    expect(matchesFilter({ severity: { op: "gte", value: 0.5 } }, { severity: 0.5 })).toBe(true);
    expect(matchesFilter({ severity: { op: "gte", value: 0.5 } }, { severity: 0.3 })).toBe(false);
    // type mismatch
    expect(matchesFilter({ severity: { op: "gte", value: 0.5 } }, { severity: "high" })).toBe(false);
  });

  it("op lte", () => {
    expect(matchesFilter({ n: { op: "lte", value: 10 } }, { n: 5 })).toBe(true);
    expect(matchesFilter({ n: { op: "lte", value: 10 } }, { n: 10 })).toBe(true);
    expect(matchesFilter({ n: { op: "lte", value: 10 } }, { n: 11 })).toBe(false);
  });

  it("op in", () => {
    expect(matchesFilter({ kind: { op: "in", value: ["a", "b"] } }, { kind: "a" })).toBe(true);
    expect(matchesFilter({ kind: { op: "in", value: ["a", "b"] } }, { kind: "c" })).toBe(false);
    // non-array value is malformed
    expect(matchesFilter({ kind: { op: "in", value: "a" } }, { kind: "a" })).toBe(false);
  });

  it("op eq explicit", () => {
    expect(matchesFilter({ foo: { op: "eq", value: "bar" } }, { foo: "bar" })).toBe(true);
    expect(matchesFilter({ foo: { op: "eq", value: "bar" } }, { foo: "baz" })).toBe(false);
  });

  it("no suffix magic — field names ending in In/Gte/Lte are literal", () => {
    // CRITICAL: guards against the prompt-4 pattern-violation fix.
    // `domainIn: "acme.com"` must equality-check a field literally named `domainIn`.
    expect(matchesFilter({ domainIn: "acme.com" }, { domainIn: "acme.com" })).toBe(true);
    expect(matchesFilter({ domainIn: "acme.com" }, { domain: "acme.com" })).toBe(false);
  });

  it("multiple keys ANDed", () => {
    expect(matchesFilter({ domain: "sales", severity: { op: "gte", value: 0.5 } }, { domain: "sales", severity: 0.8 })).toBe(true);
    expect(matchesFilter({ domain: "sales", severity: { op: "gte", value: 0.5 } }, { domain: "sales", severity: 0.3 })).toBe(false);
    expect(matchesFilter({ domain: "sales", severity: { op: "gte", value: 0.5 } }, { domain: "marketing", severity: 0.8 })).toBe(false);
  });

  it("unknown op → match nothing", () => {
    expect(matchesFilter({ x: { op: "startswith", value: "foo" } as unknown as Record<string, unknown>["x"] }, { x: "foo" })).toBe(false);
  });

  it("malformed predicate (array as value) → match nothing", () => {
    expect(matchesFilter({ x: ["a", "b"] as unknown as Record<string, unknown>["x"] }, { x: "a" })).toBe(false);
  });
});

describe("isKnownEventType", () => {
  it("accepts taxonomy events", () => {
    expect(isKnownEventType("situation.detected")).toBe(true);
    expect(isKnownEventType("initiative.accepted")).toBe(true);
    expect(isKnownEventType("system_job.completed")).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isKnownEventType("situation.fabricated")).toBe(false);
    expect(isKnownEventType("")).toBe(false);
  });
});
