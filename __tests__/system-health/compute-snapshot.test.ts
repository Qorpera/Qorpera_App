import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: { findMany: vi.fn() },
    syncLog: { findMany: vi.fn() },
    rawContent: { groupBy: vi.fn() },
    knowledgePage: { groupBy: vi.fn(), count: vi.fn() },
    situationType: { count: vi.fn(), aggregate: vi.fn() },
    domainHealth: { findMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import {
  computeOperatorHealth,
  computeConnectorHealth,
  recomputeHealthSnapshots,
} from "@/lib/system-health/compute-snapshot";

const p = prisma as any;

// ── Helpers ─────────────────────────────────────────────────────────────────

const OP = "op1";

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn1",
    name: "HubSpot",
    provider: "hubspot",
    status: "active",
    lastSyncAt: new Date("2026-03-20"),
    lastError: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

function setupEmpty() {
  p.sourceConnector.findMany.mockResolvedValue([]);
  p.syncLog.findMany.mockResolvedValue([]);
  p.rawContent.groupBy.mockResolvedValue([]);
  p.knowledgePage.groupBy.mockResolvedValue([]);
  p.knowledgePage.count.mockResolvedValue(0);
  p.situationType.count.mockResolvedValue(0);
  p.situationType.aggregate.mockResolvedValue({
    _sum: { detectedCount: 0, confirmedCount: 0 },
  });
  p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeConnectorHealth", () => {
  it("returns empty array when no connectors", async () => {
    p.sourceConnector.findMany.mockResolvedValue([]);
    p.syncLog.findMany.mockResolvedValue([]);
    p.rawContent.groupBy.mockResolvedValue([]);

    const result = await computeConnectorHealth(OP);
    expect(result).toHaveLength(0);
  });

  it("maps active connector correctly", async () => {
    p.sourceConnector.findMany.mockResolvedValue([makeConnector()]);
    p.syncLog.findMany.mockResolvedValue([
      { connectorId: "conn1", createdAt: new Date("2026-03-20") },
    ]);
    p.rawContent.groupBy.mockResolvedValue([
      { accountId: "conn1", _count: 42 },
    ]);

    const result = await computeConnectorHealth(OP);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
    expect(result[0].entityCount).toBe(42);
    expect(result[0].issue).toBeNull();
  });

  it("disconnected connector produces correct issue and action", async () => {
    p.sourceConnector.findMany.mockResolvedValue([
      makeConnector({ status: "disconnected", provider: "google" }),
    ]);
    p.syncLog.findMany.mockResolvedValue([]);
    p.rawContent.groupBy.mockResolvedValue([]);

    const result = await computeConnectorHealth(OP);
    expect(result[0].issue).toBe("Authentication expired");
    expect(result[0].action).toEqual({
      label: "Reconnect",
      href: "/settings?tab=connections",
    });
  });

  it("consecutive failures upgrade active to error", async () => {
    p.sourceConnector.findMany.mockResolvedValue([
      makeConnector({ consecutiveFailures: 3, lastError: "Token revoked" }),
    ]);
    p.syncLog.findMany.mockResolvedValue([]);
    p.rawContent.groupBy.mockResolvedValue([]);

    const result = await computeConnectorHealth(OP);
    expect(result[0].status).toBe("error");
    expect(result[0].issue).toContain("Sync failing");
  });
});

describe("computeOperatorHealth", () => {
  it("empty operator returns healthy with zero counts", async () => {
    setupEmpty();

    const snap = await computeOperatorHealth(OP);

    expect(snap.operatorId).toBe(OP);
    expect(snap.connectors).toHaveLength(0);
    expect(snap.wiki.totalPages).toBe(0);
    expect(snap.people.totalProfiles).toBe(0);
    expect(snap.detection.totalSituationTypes).toBe(0);
    expect(snap.rawContent.totalItems).toBe(0);
    expect(snap.overallStatus).toBe("healthy");
  });

  it("disconnected connector + empty wiki = critical", async () => {
    setupEmpty();
    p.sourceConnector.findMany.mockResolvedValue([
      makeConnector({ status: "disconnected" }),
    ]);

    const snap = await computeOperatorHealth(OP);
    expect(snap.overallStatus).toBe("critical");
  });

  it("many stale pages = attention", async () => {
    setupEmpty();
    p.knowledgePage.groupBy.mockResolvedValue([
      { pageType: "entity_profile", status: "stale", _count: 8, _avg: { confidence: 0.5 } },
      { pageType: "entity_profile", status: "verified", _count: 2, _avg: { confidence: 0.9 } },
    ]);

    const snap = await computeOperatorHealth(OP);
    expect(snap.wiki.totalPages).toBe(10);
    expect(snap.wiki.stalePages).toBe(8);
    expect(snap.overallStatus).toBe("attention");
  });

  it("all active connectors + wiki pages = healthy", async () => {
    setupEmpty();
    p.sourceConnector.findMany.mockResolvedValue([makeConnector()]);
    p.syncLog.findMany.mockResolvedValue([
      { connectorId: "conn1", createdAt: new Date() },
    ]);
    p.knowledgePage.groupBy.mockResolvedValue([
      { pageType: "entity_profile", status: "verified", _count: 10, _avg: { confidence: 0.85 } },
    ]);

    const snap = await computeOperatorHealth(OP);
    expect(snap.overallStatus).toBe("healthy");
  });

  it("wiki stats compute correctly from groupBy", async () => {
    setupEmpty();
    p.knowledgePage.groupBy.mockResolvedValue([
      { pageType: "person_profile", status: "verified", _count: 5, _avg: { confidence: 0.9 } },
      { pageType: "person_profile", status: "draft", _count: 3, _avg: { confidence: 0.4 } },
      { pageType: "entity_profile", status: "verified", _count: 7, _avg: { confidence: 0.8 } },
      { pageType: "entity_profile", status: "stale", _count: 2, _avg: { confidence: 0.3 } },
    ]);

    const snap = await computeOperatorHealth(OP);
    expect(snap.wiki.totalPages).toBe(17);
    expect(snap.wiki.verifiedPages).toBe(12);
    expect(snap.wiki.draftPages).toBe(3);
    expect(snap.wiki.stalePages).toBe(2);
    expect(snap.wiki.byPageType).toEqual({
      person_profile: 8,
      entity_profile: 9,
    });
  });

  it("detection stats include confirmation rate", async () => {
    setupEmpty();
    p.situationType.count
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(3); // active
    p.knowledgePage.count.mockResolvedValue(12); // person_profile count returns 0 first, then 12 for detected30d
    p.situationType.aggregate.mockResolvedValue({
      _sum: { detectedCount: 100, confirmedCount: 75 },
    });

    const snap = await computeOperatorHealth(OP);
    expect(snap.detection.totalSituationTypes).toBe(5);
    expect(snap.detection.activeSituationTypes).toBe(3);
    expect(snap.detection.confirmationRate).toBe(0.75);
  });

  it("raw content stats aggregate by source type", async () => {
    setupEmpty();
    // Queries run in parallel — use implementation mock keyed on `by` field
    p.rawContent.groupBy.mockImplementation((args: any) => {
      if (args?.by?.[0] === "sourceType") {
        return Promise.resolve([
          { sourceType: "email", _count: 100 },
          { sourceType: "slack_message", _count: 50 },
          { sourceType: "document", _count: 10 },
        ]);
      }
      return Promise.resolve([]); // accountId groupBy (connector counts)
    });

    const snap = await computeOperatorHealth(OP);
    expect(snap.rawContent.totalItems).toBe(160);
    expect(snap.rawContent.bySourceType).toEqual({
      email: 100,
      slack_message: 50,
      document: 10,
    });
  });
});

describe("recomputeHealthSnapshots", () => {
  it("persists snapshot and cleans up legacy rows", async () => {
    setupEmpty();
    p.$transaction.mockResolvedValue(undefined);

    await recomputeHealthSnapshots(OP);

    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });

  it("never throws even on database error", async () => {
    p.sourceConnector.findMany.mockRejectedValue(new Error("DB connection lost"));

    await expect(recomputeHealthSnapshots(OP)).resolves.toBeUndefined();
  });
});
