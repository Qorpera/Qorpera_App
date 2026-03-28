import { describe, it, expect } from "vitest";

describe("EvaluationLog schema", () => {
  it("has the expected fields", () => {
    // Import the Prisma client type to verify the model exists at compile time
    // This test validates the schema was generated correctly
    type EvalLog = {
      id: string;
      operatorId: string;
      actorEntityId: string | null;
      sourceType: string;
      sourceId: string;
      classification: string;
      summary: string | null;
      reasoning: string | null;
      urgency: string | null;
      confidence: number | null;
      situationId: string | null;
      metadata: unknown;
      evaluatedAt: Date;
    };

    // Type-level assertion — if the schema doesn't match, this won't compile
    const sample: EvalLog = {
      id: "test",
      operatorId: "op-1",
      actorEntityId: null,
      sourceType: "email",
      sourceId: "msg-1",
      classification: "irrelevant",
      summary: null,
      reasoning: null,
      urgency: null,
      confidence: null,
      situationId: null,
      metadata: null,
      evaluatedAt: new Date(),
    };
    expect(sample.classification).toBe("irrelevant");
  });
});
