import { describe, it, expect } from "vitest";

describe("Synthetic company data composition", () => {

  describe("Boltly", () => {
    it("has approximately 200 content chunks", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      expect(boltly.content.length).toBeGreaterThan(150);
      expect(boltly.content.length).toBeLessThan(300);
    });

    it("has 11 employees", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      expect(boltly.employees.length).toBe(11);
    });

    it("has at least 1 admin", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      expect(boltly.employees.filter(e => e.role === "admin").length).toBeGreaterThanOrEqual(1);
    });

    it("all content has valid sourceType", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      const validTypes = ["email", "slack_message", "drive_doc", "calendar_note"];
      for (const c of boltly.content) {
        expect(validTypes).toContain(c.sourceType);
      }
    });

    it("all content has non-empty content field", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      for (const c of boltly.content) {
        expect(c.content.length).toBeGreaterThan(10);
      }
    });

    it("all email content has from/to/subject metadata", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      const emails = boltly.content.filter(c => c.sourceType === "email");
      for (const e of emails) {
        expect(e.metadata).toHaveProperty("from");
        expect(e.metadata).toHaveProperty("to");
        expect(e.metadata).toHaveProperty("subject");
      }
    });

    it("has activity signals for all employees", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      const employeeEmails = new Set(boltly.employees.map(e => e.email));
      const actorEmails = new Set(boltly.activitySignals.map(s => s.actorEmail));
      for (const email of employeeEmails) {
        expect(actorEmails.has(email)).toBe(true);
      }
    });

    it("content spans at least 60 days of history", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      const maxDaysAgo = Math.max(...boltly.content.map(c => c.daysAgo ?? 0));
      expect(maxDaysAgo).toBeGreaterThanOrEqual(60);
    });

    it("has departed employee Jens in old content but NOT in employee list", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      expect(boltly.employees.find(e => e.email === "jens@boltly.dk")).toBeUndefined();
      const jensContent = boltly.content.filter(c =>
        c.content.includes("Jens") ||
        (c.metadata as any).from === "jens@boltly.dk" ||
        (c.metadata as any).authorEmail === "jens@boltly.dk" ||
        (c.metadata as any).cc?.includes("jens@boltly.dk")
      );
      expect(jensContent.length).toBeGreaterThan(0);
    });

    it("all content has a connectorProvider matching a company connector", async () => {
      const { default: boltly } = await import("@/lib/demo/companies/boltly");
      const validProviders = new Set(boltly.connectors.map(c => c.provider));
      for (const c of boltly.content) {
        expect(validProviders.has(c.connectorProvider)).toBe(true);
      }
    });
  });

  describe("Tallyo", () => {
    it("has approximately 280 content chunks", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      expect(tallyo.content.length).toBeGreaterThan(220);
      expect(tallyo.content.length).toBeLessThan(400);
    });

    it("has 25 employees", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      expect(tallyo.employees.length).toBe(25);
    });

    it("has FlowAgency in companies (dual relationship)", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      expect(tallyo.companies.find(c => c.name.includes("FlowAgency"))).toBeDefined();
    });

    it("has Steen Gram in employees (contractor test)", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      expect(tallyo.employees.find(e => e.email === "steen@tallyo.dk")).toBeDefined();
    });

    it("has Slack channels including cross-functional #product-alpha", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      expect(tallyo.slackChannels?.find(c => c.channelName === "#product-alpha")).toBeDefined();
    });

    it("all content has valid connectorProvider", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      const validProviders = new Set(tallyo.connectors.map(c => c.provider));
      for (const c of tallyo.content) {
        expect(validProviders.has(c.connectorProvider)).toBe(true);
      }
    });

    it("has both old and new Kreativ Bureau contacts in content", async () => {
      const { default: tallyo } = await import("@/lib/demo/companies/tallyo");
      const hasLena = tallyo.content.some(c => c.content.includes("Lena"));
      const hasTom = tallyo.content.some(c => c.content.includes("Tom Ager") || c.content.includes("tom@kreativbureau"));
      expect(hasLena).toBe(true);
      expect(hasTom).toBe(true);
    });
  });

  describe("Meridian Teknik", () => {
    it("has approximately 260 content chunks", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      expect(meridian.content.length).toBeGreaterThan(200);
      expect(meridian.content.length).toBeLessThan(400);
    });

    it("has 35 employees", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      expect(meridian.employees.length).toBe(35);
    });

    it("has StålGruppen in companies (bidirectional relationship)", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      expect(meridian.companies.find(c => c.name.includes("StålGruppen"))).toBeDefined();
    });

    it("has bilingual content (Danish + English + German)", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      const hasGerman = meridian.content.some(c =>
        c.content.includes("Sehr geehrter") || c.content.includes("Mit freundlichen Grüßen")
      );
      const hasEnglish = meridian.content.some(c =>
        c.content.includes("Dear") || c.content.includes("Best regards")
      );
      const hasDanish = meridian.content.some(c =>
        c.content.includes("Hej") || c.content.includes("Venlig hilsen")
      );
      expect(hasGerman).toBe(true);
      expect(hasEnglish).toBe(true);
      expect(hasDanish).toBe(true);
    });

    it("has Müller relationship arc spanning 150+ days", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      const mullerContent = meridian.content.filter(c =>
        c.content.includes("Müller") || c.content.includes("Schneider") || c.content.includes("mueller-maschinenbau")
      );
      const maxDays = Math.max(...mullerContent.map(c => c.daysAgo ?? 0));
      expect(maxDays).toBeGreaterThanOrEqual(150);
      expect(mullerContent.length).toBeGreaterThanOrEqual(10);
    });

    it("uses Microsoft 365 connector providers", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      const providers = new Set(meridian.connectors.map(c => c.provider));
      expect(providers.has("microsoft-365-outlook")).toBe(true);
    });

    it("has Claus in employees (agent/broker test)", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      expect(meridian.employees.find(e => e.email === "claus@meridian-teknik.dk")).toBeDefined();
    });

    it("all content has a connectorProvider matching a company connector", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      const validProviders = new Set(meridian.connectors.map(c => c.provider));
      for (const c of meridian.content) {
        expect(validProviders.has(c.connectorProvider)).toBe(true);
      }
    });

    it("has the subtle decimal error contradiction (±0,5mm vs ±0,05mm)", async () => {
      const { default: meridian } = await import("@/lib/demo/companies/meridian-teknik");
      const wrongSpec = meridian.content.find(c =>
        c.content.includes("±0,5mm") && c.sourceType === "drive_doc"
      );
      const correctComplaints = meridian.content.filter(c =>
        c.content.includes("±0.05mm") || c.content.includes("±0,05mm")
      );
      expect(wrongSpec).toBeDefined();
      expect(correctComplaints.length).toBeGreaterThan(0);
    });
  });
});
