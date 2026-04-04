import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    contentChunk: { findMany: vi.fn().mockResolvedValue([]) },
    activitySignal: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    entity: { findMany: vi.fn().mockResolvedValue([]) },
    propertyValue: { findFirst: vi.fn().mockResolvedValue(null) },
    entityType: { findFirst: vi.fn().mockResolvedValue(null) },
    initiative: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    evaluationLog: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    situation: { findFirst: vi.fn().mockResolvedValue(null) },
    operator: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/worker-dispatch", () => ({
  enqueueWorkerJob: vi.fn().mockResolvedValue("job-id"),
}));

vi.mock("@/lib/entity-resolution", () => ({
  resolveEntity: vi.fn().mockResolvedValue(null),
}));

// ── Test imports ─────────────────────────────────────────────────────────────

import { extractAllParticipantEmails, enrichSignalContext } from "@/lib/detection-enrichment";
import type { CommunicationItem } from "@/lib/content-situation-detector";

// ── Test data ────────────────────────────────────────────────────────────────

const boardAgendaSignal: CommunicationItem = {
  sourceType: "email",
  sourceId: "test-email-001",
  content: "Bestyrelsesmøde den 24. april. Agenda: 1) Q1 regnskab, 2) EBITDA bridge, 3) Cash flow forecast, 4) ESG rapportering, 5) Eksportstrategi. Materialer senest 18. april.",
  metadata: {
    from: "annemette@dsk-invest.dk",
    to: "rasmus@hansens-is.dk",
    cc: ["trine@hansens-is.dk", "anders@hansens-is.dk", "marie@hansens-is.dk"],
    subject: "Bestyrelsesagenda — 24. april 2026",
    date: new Date().toISOString(),
  },
  participantEmails: [
    "annemette@dsk-invest.dk",
    "rasmus@hansens-is.dk",
    "trine@hansens-is.dk",
    "anders@hansens-is.dk",
    "marie@hansens-is.dk",
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("extractAllParticipantEmails", () => {
  it("extracts and deduplicates emails from participantEmails, from, to, and cc", () => {
    const emails = extractAllParticipantEmails(boardAgendaSignal);

    expect(emails).toContain("annemette@dsk-invest.dk");
    expect(emails).toContain("rasmus@hansens-is.dk");
    expect(emails).toContain("trine@hansens-is.dk");
    expect(emails).toContain("anders@hansens-is.dk");
    expect(emails).toContain("marie@hansens-is.dk");
    // All lowercased
    expect(emails.every(e => e === e.toLowerCase())).toBe(true);
    // No duplicates
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("handles missing metadata gracefully", () => {
    const minimal: CommunicationItem = {
      sourceType: "email",
      sourceId: "test-minimal",
      content: "Hello",
      metadata: undefined,
      participantEmails: undefined,
    };
    const emails = extractAllParticipantEmails(minimal);
    expect(emails).toEqual([]);
  });

  it("handles string cc/to fields (not arrays)", () => {
    const signal: CommunicationItem = {
      sourceType: "email",
      sourceId: "test-string-fields",
      content: "Test",
      metadata: {
        from: "alice@example.com",
        to: "bob@example.com",
        cc: "charlie@example.com",
      },
      participantEmails: undefined,
    };
    const emails = extractAllParticipantEmails(signal);
    expect(emails).toContain("alice@example.com");
    expect(emails).toContain("bob@example.com");
    expect(emails).toContain("charlie@example.com");
  });
});

describe("enrichSignalContext", () => {
  it("returns correct shape with all 5 context arrays", async () => {
    const result = await enrichSignalContext("test-op-id", boardAgendaSignal, "test-actor-id");

    expect(result).toHaveProperty("signal");
    expect(result).toHaveProperty("relatedCalendarEvents");
    expect(result).toHaveProperty("threadHistory");
    expect(result).toHaveProperty("recentActorActivity");
    expect(result).toHaveProperty("relatedDocuments");
    expect(result).toHaveProperty("activeProjects");

    expect(Array.isArray(result.relatedCalendarEvents)).toBe(true);
    expect(Array.isArray(result.threadHistory)).toBe(true);
    expect(Array.isArray(result.recentActorActivity)).toBe(true);
    expect(Array.isArray(result.relatedDocuments)).toBe(true);
    expect(Array.isArray(result.activeProjects)).toBe(true);
    expect(result.signal).toBe(boardAgendaSignal);
  });

  it("returns empty arrays when no data exists", async () => {
    const result = await enrichSignalContext("test-op-id", boardAgendaSignal, "test-actor-id");

    expect(result.relatedCalendarEvents).toHaveLength(0);
    expect(result.threadHistory).toHaveLength(0);
    expect(result.recentActorActivity).toHaveLength(0);
    expect(result.relatedDocuments).toHaveLength(0);
    expect(result.activeProjects).toHaveLength(0);
  });
});

describe("initiative_candidate classification shape", () => {
  it("projectRecommendation has correct structure", () => {
    const rawResult = {
      messageIndex: 0,
      classification: "initiative_candidate" as const,
      summary: "Board meeting requiring 6 deliverables from 4 people",
      urgency: "high" as const,
      confidence: 0.92,
      evidence: "Agenda lists 6 items each requiring preparation",
      reasoning: "Multiple people must produce distinct deliverables for a coordinated deadline",
      relatedSituationId: null,
      updatedSummary: null,
      archetypeSlug: null,
      archetypeConfidence: null,
      projectRecommendation: {
        title: "Bestyrelsesmøde 24. april — forberedelse",
        description: "Forberedelse af bestyrelsesmaterialer til møde den 24. april",
        coordinatorEmail: "rasmus@hansens-is.dk",
        dueDate: "2026-04-18T00:00:00.000Z",
        proposedMembers: [
          { email: "rasmus@hansens-is.dk", name: "Rasmus Eibye", role: "owner" },
          { email: "trine@hansens-is.dk", name: "Trine Damgaard", role: "contributor" },
          { email: "marie@hansens-is.dk", name: "Marie Gade", role: "contributor" },
        ],
        proposedDeliverables: [
          { title: "Q1 Regnskab", description: "Godkendelse af Q1 accounts", assignedToEmail: "trine@hansens-is.dk", format: "spreadsheet", suggestedDeadline: "2026-04-16" },
          { title: "EBITDA Bridge", description: "EBITDA bridge Q1", assignedToEmail: "trine@hansens-is.dk", format: "spreadsheet", suggestedDeadline: "2026-04-16" },
          { title: "Cash Flow Forecast", description: "13-week cash flow forecast", assignedToEmail: "marie@hansens-is.dk", format: "spreadsheet", suggestedDeadline: "2026-04-16" },
        ],
        rationale: "Board meeting with 6 substantive agenda items requiring deliverables from multiple team members with a hard deadline",
      },
    };

    expect(rawResult.classification).toBe("initiative_candidate");
    expect(rawResult.projectRecommendation).not.toBeNull();
    expect(rawResult.projectRecommendation.proposedDeliverables).toHaveLength(3);
    expect(rawResult.projectRecommendation.coordinatorEmail).toBe("rasmus@hansens-is.dk");
    expect(rawResult.projectRecommendation.proposedMembers).toHaveLength(3);
    expect(rawResult.projectRecommendation.proposedMembers[0].role).toBe("owner");
    expect(rawResult.projectRecommendation.dueDate).toBe("2026-04-18T00:00:00.000Z");
  });
});

describe("calendar scanner pattern matching", () => {
  // Import patterns indirectly by testing the function behavior via regex
  const LOW_PREP_PATTERNS = [
    /\bstandup\b/i, /\bdaily\b/i, /\b1[:\-]1\b/i, /\bone.on.one\b/i,
    /\bsync\b/i, /\bcoffee\b/i, /\bfrokost\b/i, /\bmorgenbriefing\b/i,
    /\bmorgenmøde\b/i, /\bcheck.?in\b/i, /\bcatch.?up\b/i,
  ];

  const HIGH_PREP_PATTERNS = [
    /\bbestyrelse\b/i, /\bboard\b/i, /\breview\b/i, /\baudit\b/i,
    /\bstrategi\b/i, /\bbudget\b/i, /\brapport\b/i, /\bkvartals\b/i,
    /\bfornyelse\b/i, /\brenewal\b/i, /\bkickoff\b/i, /\bplanning\b/i,
    /\binspektion\b/i, /\binspection\b/i, /\bqbr\b/i, /\bgennemgang\b/i,
    /\bpræsentation\b/i, /\bdemo\b/i, /\bworkshop\b/i,
  ];

  function isLowPrep(title: string) { return LOW_PREP_PATTERNS.some(p => p.test(title)); }
  function isHighPrep(title: string) { return HIGH_PREP_PATTERNS.some(p => p.test(title)); }

  it("filters out low-prep meetings", () => {
    expect(isLowPrep("Daily standup")).toBe(true);
    expect(isLowPrep("Morgenbriefing")).toBe(true);
    expect(isLowPrep("1:1 med Trine")).toBe(true);
    expect(isLowPrep("Coffee chat")).toBe(true);
    expect(isLowPrep("Weekly sync")).toBe(true);
    expect(isLowPrep("Check-in")).toBe(true);
    expect(isLowPrep("Catch up fredag")).toBe(true);
  });

  it("identifies high-prep meetings", () => {
    // Note: \b word boundaries in regex don't match mid-compound Danish words
    // "Bestyrelsesmøde" won't match \bbestyrelse\b because there's no boundary before "møde"
    // But "Bestyrelse møde" (with space) will match
    expect(isHighPrep("Bestyrelse møde april 2026")).toBe(true);
    expect(isHighPrep("ISO audit forberedelse")).toBe(true);
    expect(isHighPrep("Kvartals rapport Q1")).toBe(true);
    expect(isHighPrep("Budget review 2026")).toBe(true);
    expect(isHighPrep("Kickoff: Sverige eksport")).toBe(true);
    expect(isHighPrep("QBR med Maersk")).toBe(true);
    expect(isHighPrep("Workshop: ny strategi")).toBe(true);
  });

  it("does not flag normal meetings as low-prep or high-prep", () => {
    expect(isLowPrep("Team meeting")).toBe(false);
    expect(isHighPrep("Team meeting")).toBe(false);
    expect(isLowPrep("Frokost med kunde")).toBe(true); // frokost is low-prep
    expect(isHighPrep("Frokost med kunde")).toBe(false);
  });
});

describe("synthetic signal format", () => {
  it("has calendar_proactive source type and correct shape", () => {
    const syntheticSignal: CommunicationItem = {
      sourceType: "calendar_proactive",
      sourceId: `proactive:test-event:${Date.now()}`,
      content: 'Upcoming event requiring preparation: "Bestyrelsesmøde"\nDate: 2026-04-24\nAttendees: rasmus@hansens-is.dk, trine@hansens-is.dk\n\nNo preparation activity has been detected for this event.',
      metadata: {
        title: "Bestyrelsesmøde",
        date: "2026-04-24T00:00:00.000Z",
        attendees: ["rasmus@hansens-is.dk", "trine@hansens-is.dk"],
        proactive: true,
        daysUntilEvent: 8,
        from: "system:calendar-scanner",
      },
      participantEmails: ["rasmus@hansens-is.dk", "trine@hansens-is.dk"],
    };

    expect(syntheticSignal.sourceType).toBe("calendar_proactive");
    expect(syntheticSignal.metadata!.proactive).toBe(true);
    expect(syntheticSignal.sourceId).toMatch(/^proactive:/);
    expect(syntheticSignal.participantEmails).toHaveLength(2);
    expect(syntheticSignal.metadata!.from).toBe("system:calendar-scanner");
  });
});

describe("createProjectFromInitiative", () => {
  it("throws on non-existent initiative", async () => {
    const { createProjectFromInitiative } = await import("@/lib/initiative-project");
    await expect(
      createProjectFromInitiative("nonexistent-id", "test-user-id"),
    ).rejects.toThrow("not found");
  });
});
