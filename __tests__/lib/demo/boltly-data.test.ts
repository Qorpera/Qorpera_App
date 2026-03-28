import { describe, it, expect } from "vitest";
import BOLTLY from "@/lib/demo/companies/boltly";

describe("Boltly company data", () => {
  it("has 5 employees", () => {
    expect(BOLTLY.employees).toHaveLength(5);
  });

  it("has exactly one admin", () => {
    const admins = BOLTLY.employees.filter(e => e.role === "admin");
    expect(admins).toHaveLength(1);
    expect(admins[0].name).toBe("Lars Bolt");
  });

  it("all employee emails use company domain", () => {
    for (const emp of BOLTLY.employees) {
      expect(emp.email).toContain("@boltly.dk");
    }
  });

  it("all contacts reference existing companies", () => {
    const companyNames = new Set(BOLTLY.companies.map(c => c.name));
    for (const contact of BOLTLY.contacts) {
      expect(companyNames.has(contact.company)).toBe(true);
    }
  });

  it("all deals reference existing companies", () => {
    const companyNames = new Set(BOLTLY.companies.map(c => c.name));
    for (const deal of BOLTLY.deals) {
      expect(companyNames.has(deal.company)).toBe(true);
    }
  });

  it("all invoices reference existing companies", () => {
    const companyNames = new Set(BOLTLY.companies.map(c => c.name));
    for (const inv of BOLTLY.invoices) {
      expect(companyNames.has(inv.company)).toBe(true);
    }
  });

  it("has enough content for agent discovery", () => {
    // Agents need enough content to discover structure
    expect(BOLTLY.content.length).toBeGreaterThanOrEqual(25);
  });

  it("has activity signals covering email and meeting patterns", () => {
    const signalTypes = new Set(BOLTLY.activitySignals.map(s => s.signalType));
    expect(signalTypes.has("email_sent")).toBe(true);
    expect(signalTypes.has("email_received")).toBe(true);
    expect(signalTypes.has("meeting_held")).toBe(true);
  });

  it("has content from multiple source types", () => {
    const sourceTypes = new Set(BOLTLY.content.map(c => c.sourceType));
    expect(sourceTypes.has("email")).toBe(true);
    expect(sourceTypes.has("drive_doc")).toBe(true);
    expect(sourceTypes.has("calendar_note")).toBe(true);
  });

  it("all content has required metadata", () => {
    for (const c of BOLTLY.content) {
      expect(c.metadata).toBeDefined();
      expect(c.connectorProvider).toBeTruthy();
    }
  });
});
