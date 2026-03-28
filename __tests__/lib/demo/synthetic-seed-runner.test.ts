import { describe, it, expect } from "vitest";
import type { SyntheticCompany } from "@/lib/demo/synthetic-types";
import type { runSyntheticSeed } from "@/lib/demo/synthetic-seed-runner";

describe("SyntheticCompany type", () => {
  it("compiles with a minimal valid company definition", () => {
    const company: SyntheticCompany = {
      slug: "test",
      name: "Test ApS",
      industry: "Testing",
      domain: "test.dk",
      employees: [
        { name: "Admin User", email: "admin@test.dk", role: "admin" },
      ],
      connectors: [
        { provider: "gmail", name: "Gmail", assignedToEmployee: "admin@test.dk" },
      ],
      companies: [
        { name: "Client A", domain: "client-a.dk", relationship: "client" },
      ],
      contacts: [
        { name: "Contact One", email: "one@client-a.dk", company: "Client A" },
      ],
      deals: [
        { name: "Deal 1", company: "Client A", stage: "proposal", amount: 50000, createdDaysAgo: 10, lastActivityDaysAgo: 2 },
      ],
      invoices: [
        { number: "INV-001", company: "Client A", amount: 25000, status: "paid", issuedDaysAgo: 30 },
      ],
      content: [
        { sourceType: "email", content: "Hello, please review the proposal.", connectorProvider: "gmail", metadata: { from: "one@client-a.dk", to: "admin@test.dk", subject: "Proposal" } },
      ],
      activitySignals: [
        { signalType: "email_received", actorEmail: "admin@test.dk", daysAgo: 1 },
      ],
    };

    expect(company.slug).toBe("test");
    expect(company.employees).toHaveLength(1);
    expect(company.content).toHaveLength(1);
  });

  it("accepts modelOverride option", () => {
    // Type-level test — validates the function signature accepts the option
    type Params = Parameters<typeof runSyntheticSeed>;
    type SecondArg = Params[1];
    const opts: SecondArg = { modelOverride: "claude-sonnet-4-20250514" };
    expect(opts!.modelOverride).toBe("claude-sonnet-4-20250514");
  });
});
