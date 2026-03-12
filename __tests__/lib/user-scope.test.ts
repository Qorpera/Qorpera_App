import { describe, it, expect, vi } from "vitest";

// Mock prisma — user-scope.ts imports it at top level but pure functions don't use it
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  departmentScopeFilter,
  situationScopeFilter,
  canAccessDepartment,
} from "@/lib/user-scope";

describe("departmentScopeFilter", () => {
  it('returns empty object for "all" (admin access)', () => {
    const filter = departmentScopeFilter("all");
    expect(filter).toEqual({});
  });

  it("returns OR filter for specific department IDs", () => {
    const deptIds = ["dept-1", "dept-2"];
    const filter = departmentScopeFilter(deptIds);

    expect(filter).toHaveProperty("OR");
    const conditions = (filter as { OR: unknown[] }).OR;
    expect(conditions).toHaveLength(3);

    // Should include: parentDepartmentId in, id in, external category
    expect(conditions).toContainEqual({ parentDepartmentId: { in: deptIds } });
    expect(conditions).toContainEqual({ id: { in: deptIds } });
    expect(conditions).toContainEqual({ category: "external" });
  });

  it("handles empty department array", () => {
    const filter = departmentScopeFilter([]);
    const conditions = (filter as { OR: unknown[] }).OR;

    // Should still have the structure, just with empty arrays
    expect(conditions).toContainEqual({ parentDepartmentId: { in: [] } });
    expect(conditions).toContainEqual({ id: { in: [] } });
    // External entities always visible
    expect(conditions).toContainEqual({ category: "external" });
  });
});

describe("situationScopeFilter", () => {
  it('returns empty object for "all"', () => {
    expect(situationScopeFilter("all")).toEqual({});
  });

  it("returns OR filter with scoped and unscoped situations", () => {
    const deptIds = ["dept-1", "dept-2"];
    const filter = situationScopeFilter(deptIds);

    expect(filter).toHaveProperty("OR");
    const conditions = (filter as { OR: unknown[] }).OR;
    expect(conditions).toHaveLength(2);

    // Scoped situations matching visible departments
    expect(conditions).toContainEqual({
      situationType: { scopeEntityId: { in: deptIds } },
    });
    // Global situations (no scope)
    expect(conditions).toContainEqual({
      situationType: { scopeEntityId: null },
    });
  });
});

describe("canAccessDepartment", () => {
  it('returns true for "all"', () => {
    expect(canAccessDepartment("all", "any-dept")).toBe(true);
  });

  it("returns true when department is in visible list", () => {
    expect(canAccessDepartment(["dept-1", "dept-2"], "dept-1")).toBe(true);
  });

  it("returns false when department is not in visible list", () => {
    expect(canAccessDepartment(["dept-1", "dept-2"], "dept-3")).toBe(false);
  });

  it("returns false for empty department list", () => {
    expect(canAccessDepartment([], "dept-1")).toBe(false);
  });
});
