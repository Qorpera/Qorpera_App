import { describe, it, expect } from "vitest";
import { normalizeCompanyModel, type CompanyModel } from "@/lib/onboarding-intelligence/synthesis";

describe("normalizeCompanyModel", () => {
  it("passes conforming input through unchanged", () => {
    const input: CompanyModel = {
      domains: [{ name: "Engineering", description: "Builds stuff", confidence: "high" }],
      people: [{ email: "a@co.dk", displayName: "Alice", primaryDepartment: "Engineering", role: "Dev", roleLevel: "ic" }],
      crossFunctionalPeople: [],
      processes: [],
      keyRelationships: [],
      financialSnapshot: { currency: "DKK", revenueTrend: "up", overdueInvoiceCount: 0, dataCompleteness: "high" },
      situationTypeRecommendations: [],
      uncertaintyLog: [],
    };

    const result = normalizeCompanyModel(input as unknown as Record<string, unknown>);
    expect(result.domains).toHaveLength(1);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].email).toBe("a@co.dk");
    expect(result.people[0].primaryDepartment).toBe("Engineering");
  });

  it("flattens domains[].members[] into top-level people[]", () => {
    const input = {
      domains: [
        {
          name: "Ledelse",
          description: "Leadership",
          members: [
            { email: "lars@co.dk", displayName: "Lars Bolt", role: "Ejer", roleLevel: "c_level" },
          ],
        },
        {
          name: "Drift",
          description: "Operations",
          members: [
            { email: "mikkel@co.dk", displayName: "Mikkel R", role: "Elektriker", roleLevel: "ic" },
            { email: "sofie@co.dk", displayName: "Sofie J", role: "Elektriker", roleLevel: "ic" },
          ],
        },
      ],
      crossFunctionalPeople: [],
    };

    const result = normalizeCompanyModel(input as Record<string, unknown>);
    expect(result.people).toHaveLength(3);
    expect(result.people[0].primaryDepartment).toBe("Ledelse");
    expect(result.people[0].email).toBe("lars@co.dk");
    expect(result.people[1].primaryDepartment).toBe("Drift");
    expect(result.people[2].primaryDepartment).toBe("Drift");
    // Departments should be cleaned (no members key)
    expect((result.domains[0] as any).members).toBeUndefined();
  });

  it("resolves reportingRelationships[] into people[].reportsToEmail", () => {
    const input = {
      domains: [
        {
          name: "Team",
          description: "The team",
          members: [
            { email: "boss@co.dk", displayName: "Boss", role: "CEO", roleLevel: "c_level" },
            { email: "dev@co.dk", displayName: "Dev", role: "Developer", roleLevel: "ic" },
          ],
        },
      ],
      reportingRelationships: [
        { report: "dev@co.dk", manager: "boss@co.dk", confidence: "high" },
      ],
    };

    const result = normalizeCompanyModel(input as Record<string, unknown>);
    expect(result.people).toHaveLength(2);
    const dev = result.people.find((p) => p.email === "dev@co.dk");
    expect(dev?.reportsToEmail).toBe("boss@co.dk");
    const boss = result.people.find((p) => p.email === "boss@co.dk");
    expect(boss?.reportsToEmail).toBeUndefined();
  });

  it("returns valid empty model for null/empty input", () => {
    const result = normalizeCompanyModel({});
    expect(result.domains).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.crossFunctionalPeople).toEqual([]);
    expect(result.processes).toEqual([]);
    expect(result.keyRelationships).toEqual([]);
    expect(result.situationTypeRecommendations).toEqual([]);
    expect(result.uncertaintyLog).toEqual([]);
    expect(result.financialSnapshot.currency).toBe("DKK");
  });

  it("does not flatten members when top-level people[] already exists", () => {
    const input = {
      domains: [
        {
          name: "Dept",
          description: "A dept",
          members: [{ email: "nested@co.dk", displayName: "Nested", role: "X", roleLevel: "ic" }],
        },
      ],
      people: [
        { email: "toplevel@co.dk", displayName: "Top", primaryDepartment: "Dept", role: "Y", roleLevel: "ic" },
      ],
    };

    const result = normalizeCompanyModel(input as Record<string, unknown>);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].email).toBe("toplevel@co.dk");
  });
});
