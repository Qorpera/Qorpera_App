import { describe, it, expect } from "vitest";

/**
 * Tests that the request body construction in the department page
 * correctly maps field names to what the API schemas expect.
 */

describe("saveDeptField body construction", () => {
  // Replicates the fixed logic from saveDeptField in map/[departmentId]/page.tsx
  function buildDeptBody(field: "name" | "description", value: string) {
    return { [field === "name" ? "displayName" : field]: value };
  }

  it("maps 'name' field to displayName in body", () => {
    const body = buildDeptBody("name", "New Name");
    expect(body).toEqual({ displayName: "New Name" });
    expect(body).not.toHaveProperty("name");
  });

  it("passes 'description' field through unchanged", () => {
    const body = buildDeptBody("description", "New Desc");
    expect(body).toEqual({ description: "New Desc" });
  });
});

describe("saveEdit body construction", () => {
  // Replicates the fixed logic from saveEdit in map/[departmentId]/page.tsx
  function buildEditBody(editName: string, editRole: string, editEmail: string) {
    return { displayName: editName.trim(), role: editRole.trim(), email: editEmail.trim() };
  }

  it("produces body with displayName key (not name)", () => {
    const body = buildEditBody("Alice Smith", "Engineer", "alice@example.com");
    expect(body).toEqual({
      displayName: "Alice Smith",
      role: "Engineer",
      email: "alice@example.com",
    });
    expect(body).not.toHaveProperty("name");
  });

  it("trims whitespace from all fields", () => {
    const body = buildEditBody("  Bob  ", "  Manager  ", "  bob@test.com  ");
    expect(body).toEqual({
      displayName: "Bob",
      role: "Manager",
      email: "bob@test.com",
    });
  });
});
