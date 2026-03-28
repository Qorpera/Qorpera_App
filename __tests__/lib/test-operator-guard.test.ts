import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockOperatorFindUnique } = vi.hoisted(() => ({
  mockOperatorFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findUnique: mockOperatorFindUnique },
  },
}));

import { isTestOperator, NOT_TEST_OPERATOR } from "@/lib/test-operator-guard";

beforeEach(() => {
  mockOperatorFindUnique.mockReset();
});

// ── 1. Returns true for test operators ─────────────────────────────────────

describe("isTestOperator", () => {
  test("returns true for test operators", async () => {
    mockOperatorFindUnique.mockResolvedValueOnce({ isTestOperator: true });
    expect(await isTestOperator("op-test")).toBe(true);
  });

  // ── 2. Returns false for real operators ────────────────────────────────────

  test("returns false for real operators", async () => {
    mockOperatorFindUnique.mockResolvedValueOnce({ isTestOperator: false });
    expect(await isTestOperator("op-real")).toBe(false);
  });

  // ── 3. Returns false for non-existent operators ────────────────────────────

  test("returns false for non-existent operators (defensive)", async () => {
    mockOperatorFindUnique.mockResolvedValueOnce(null);
    expect(await isTestOperator("op-missing")).toBe(false);
  });
});

// ── 4. NOT_TEST_OPERATOR filter shape ──────────────────────────────────────

describe("NOT_TEST_OPERATOR", () => {
  test("has correct shape for Prisma where clause", () => {
    expect(NOT_TEST_OPERATOR).toEqual({
      operator: { isTestOperator: false },
    });
  });
});
