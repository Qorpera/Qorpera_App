vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/entity-resolution", () => ({ getEntityContext: vi.fn() }));
vi.mock("@/lib/graph-traversal", () => ({ searchAround: vi.fn() }));
vi.mock("@/lib/wiki-embedder", () => ({ embedTexts: vi.fn() }));
vi.mock("@/lib/business-context", () => ({ getBusinessContext: vi.fn(), formatBusinessContext: vi.fn() }));

import { describe, it, expect, vi } from "vitest";
import type {
  SituationContext,
  ActivityTimeline,
  CommunicationContext,
  CrossDomainContext,
  ContextSectionMeta,
} from "@/lib/context-assembly";

// These sub-types are not exported — extract from parent types
type ActivityTimelineBucket = ActivityTimeline["buckets"][number];
type CommunicationExcerpt = CommunicationContext["excerpts"][number];
type CrossDomainSignal = CrossDomainContext["signals"][number];

describe("SituationContext type contract", () => {
  it("compiles with all v3 fields present", () => {
    const ctx: SituationContext = {
      triggerEntity: { id: "e1", type: "company", typeSlug: "company", displayName: "Acme", category: "external", properties: {} },
      domains: [],
      domainKnowledge: [],
      relatedEntities: { base: [], digital: [], external: [] },
      recentEvents: [],
      priorSituations: [],
      availableActions: [],
      policies: [],
      businessContext: "",
      activityTimeline: { buckets: [], trend: "No trend data available", totalSignals: 0 },
      communicationContext: { excerpts: [], sourceBreakdown: {} },
      crossDomainSignals: { signals: [] },
      contextSections: [],
      connectorCapabilities: [],
    };

    expect(ctx.activityTimeline).toBeDefined();
    expect(ctx.communicationContext).toBeDefined();
    expect(ctx.crossDomainSignals).toBeDefined();
    expect(ctx.contextSections).toEqual([]);
  });
});

describe("ActivityTimeline structure", () => {
  it("supports 3 time buckets with all required fields", () => {
    const buckets: ActivityTimelineBucket[] = [
      { period: "Last 7 days", emailSent: 5, emailReceived: 8, meetingsHeld: 2, meetingMinutes: 90, slackMessages: 12, docsEdited: 3, docsCreated: 1, avgResponseTimeHours: 2.5 },
      { period: "Days 8-14", emailSent: 3, emailReceived: 6, meetingsHeld: 1, meetingMinutes: 45, slackMessages: 8, docsEdited: 1, docsCreated: 0, avgResponseTimeHours: null },
      { period: "Days 15-30", emailSent: 0, emailReceived: 0, meetingsHeld: 0, meetingMinutes: 0, slackMessages: 0, docsEdited: 0, docsCreated: 0, avgResponseTimeHours: null },
    ];

    const timeline: ActivityTimeline = {
      buckets,
      trend: "Email volume ↓60%, meetings ↓50% vs prior 30d",
      totalSignals: 50,
    };

    expect(timeline.buckets).toHaveLength(3);
    expect(typeof timeline.trend).toBe("string");
    expect(typeof timeline.totalSignals).toBe("number");

    for (const b of timeline.buckets) {
      expect(b).toHaveProperty("period");
      expect(b).toHaveProperty("emailSent");
      expect(b).toHaveProperty("emailReceived");
      expect(b).toHaveProperty("meetingsHeld");
      expect(b).toHaveProperty("meetingMinutes");
      expect(b).toHaveProperty("slackMessages");
      expect(b).toHaveProperty("docsEdited");
      expect(b).toHaveProperty("docsCreated");
      expect(b).toHaveProperty("avgResponseTimeHours");
    }
  });
});

describe("CommunicationContext structure", () => {
  it("supports excerpts from different source types", () => {
    const excerpts: CommunicationExcerpt[] = [
      { sourceType: "email", content: "Hi, following up on the proposal...", metadata: { subject: "Proposal follow-up", sender: "alice@example.com", direction: "sent" }, score: 0.85 },
      { sourceType: "slack_message", content: "Can someone update me on the Acme deal?", metadata: { channel: "sales", sender: "bob", timestamp: "2026-03-10T14:00:00Z" }, score: 0.72 },
      { sourceType: "teams_message", content: "Meeting notes from yesterday", metadata: { channel: "general", sender: "carol" }, score: 0.65 },
    ];

    const ctx: CommunicationContext = {
      excerpts,
      sourceBreakdown: { email: 1, slack_message: 1, teams_message: 1 },
    };

    expect(ctx.excerpts).toHaveLength(3);
    expect(ctx.sourceBreakdown.email).toBe(1);
    expect(ctx.sourceBreakdown.slack_message).toBe(1);
    expect(ctx.sourceBreakdown.teams_message).toBe(1);
  });
});

describe("CrossDomainContext structure", () => {
  it("supports signals with all required fields", () => {
    const signal: CrossDomainSignal = {
      domainName: "Engineering",
      domainId: "dept-eng",
      emailCount: 5,
      meetingCount: 2,
      slackMentions: 8,
      lastActivityDate: "2026-03-12T10:00:00.000Z",
    };

    const ctx: CrossDomainContext = { signals: [signal] };
    expect(ctx.signals).toHaveLength(1);
    expect(ctx.signals[0].domainName).toBe("Engineering");
  });

  it("accepts empty signals array", () => {
    const ctx: CrossDomainContext = { signals: [] };
    expect(ctx.signals).toHaveLength(0);
  });
});

describe("ContextSectionMeta token estimates", () => {
  it("sums token estimates across sections", () => {
    const sections: ContextSectionMeta[] = [
      { section: "triggerEntity", itemCount: 1, tokenEstimate: 200 },
      { section: "domains", itemCount: 2, tokenEstimate: 300 },
      { section: "activityTimeline", itemCount: 15, tokenEstimate: 500 },
      { section: "communicationContext", itemCount: 6, tokenEstimate: 1200 },
      { section: "crossDomainSignals", itemCount: 3, tokenEstimate: 150 },
    ];

    const total = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
    expect(total).toBe(2350);
  });
});
