import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("Admin page synthetic company UI", () => {
  it("has synthetic company section with seed/delete/enter controls", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/admin/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("syntheticCompanies");
    expect(source).toContain("seed-synthetic");
    expect(source).toContain("Simulated Companies");
    expect(source).toContain("seedCompany");
    expect(source).toContain("deleteSyntheticCompany");
  });

  it("shows credentials modal after seeding", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/admin/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("seedResult");
    expect(source).toContain("demo1234");
    expect(source).toContain("credentials");
  });
});
