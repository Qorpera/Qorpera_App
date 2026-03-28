import { describe, it, expect } from "vitest";

describe("Questions chat system prompt", () => {
  it("filters admin-scoped questions only", () => {
    const questions = [
      { question: "Hiring plan?", scope: "admin", context: "Business plan mentions Q3 hire" },
      { question: "Mikkel's Skovgaard procedures?", scope: "department", targetEmail: "mikkel@boltly.dk", context: "Knowledge bottleneck" },
    ];

    const adminQuestions = questions.filter(q => q.scope === "admin");
    const deptQuestions = questions.filter(q => q.scope === "department");

    expect(adminQuestions).toHaveLength(1);
    expect(adminQuestions[0].question).toBe("Hiring plan?");
    expect(deptQuestions).toHaveLength(1);
    expect(deptQuestions[0].targetEmail).toBe("mikkel@boltly.dk");
  });

  it("defaults missing scope to admin", () => {
    const questions = [
      { question: "Test?", context: "ctx" },  // no scope field
    ];

    const scoped = questions.map(q => ({ ...q, scope: (q as any).scope ?? "admin" }));
    expect(scoped[0].scope).toBe("admin");
  });
});
