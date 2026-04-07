import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    sourceConnector: { findMany: vi.fn() },
    syncLog: { findMany: vi.fn() },
    slackChannelMapping: { findMany: vi.fn() },
    entityProperty: { findMany: vi.fn() },
    propertyValue: { findMany: vi.fn() },
    relationshipType: { findFirst: vi.fn() },
    relationship: { findMany: vi.fn() },
    internalDocument: { count: vi.fn() },
    operationalInsight: { findMany: vi.fn() },
    situationType: { findMany: vi.fn() },
    situation: { findMany: vi.fn() },
    entityType: { findMany: vi.fn() },
    domainHealth: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    workerJob: { count: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import {
  computeDepartmentSnapshot,
  computeOperatorSnapshot,
  recomputeHealthSnapshots,
} from "@/lib/system-health/compute-snapshot";

const p = prisma as any;

// ── Helpers ─────────────────────────────────────────────────────────────────

const OP = "op1";
const DEPT = "dept1";
const DEPT_NAME = "Engineering";

/** Argument-aware entity.count mock: returns different values by category filter */
function mockEntityCount(opts: {
  digitalExternal?: number;
  base?: number;
  byEntityType?: Record<string, number>;
}) {
  p.entity.count.mockImplementation((args: any) => {
    const where = args?.where ?? {};
    // Detection: entityType slug filter
    if (where.entityType?.slug) {
      return Promise.resolve(opts.byEntityType?.[where.entityType.slug] ?? 0);
    }
    // Pipeline: digital + external
    if (where.category?.in) {
      return Promise.resolve(opts.digitalExternal ?? 0);
    }
    // Knowledge: base
    if (where.category === "base") {
      return Promise.resolve(opts.base ?? 0);
    }
    return Promise.resolve(0);
  });
}

function setupEmptyDepartment() {
  p.entity.findFirst.mockResolvedValue({ displayName: DEPT_NAME });
  p.sourceConnector.findMany.mockResolvedValue([]);
  mockEntityCount({});
  p.syncLog.findMany.mockResolvedValue([]);
  p.slackChannelMapping.findMany.mockResolvedValue([]);
  p.entity.groupBy.mockResolvedValue([]);
  p.entityProperty.findMany.mockResolvedValue([]);
  p.propertyValue.findMany.mockResolvedValue([]);
  p.relationshipType.findFirst.mockResolvedValue(null);
  p.relationship.findMany.mockResolvedValue([]);
  p.internalDocument.count.mockResolvedValue(0);
  p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
  p.operationalInsight.findMany.mockResolvedValue([]);
  p.situationType.findMany.mockResolvedValue([]);
  p.situation.findMany.mockResolvedValue([]);
  p.entityType.findMany.mockResolvedValue([]);
}

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

function makeSituationType(overrides: Record<string, unknown> = {}) {
  return {
    id: "st1",
    name: "Overdue Invoice",
    autonomyLevel: "supervised",
    enabled: true,
    detectionLogic: JSON.stringify({
      mode: "structured",
      structured: { entityType: "invoice" },
    }),
    detectedCount: 10,
    confirmedCount: 8,
    dismissedCount: 1,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no stale worker jobs
  p.workerJob.count.mockResolvedValue(0);
});

describe("computeDepartmentSnapshot", () => {
  // 1. Empty department → all sections "empty"/"unconfigured", overall "unconfigured"
  it("empty department returns unconfigured overall with empty sections", async () => {
    setupEmptyDepartment();

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    expect(snap.domainName).toBe(DEPT_NAME);
    expect(snap.dataPipeline.status).toBe("empty");
    expect(snap.dataPipeline.connectors).toHaveLength(0);
    expect(snap.knowledge.status).toBe("empty");
    expect(snap.knowledge.people.count).toBe(0);
    expect(snap.detection.status).toBe("unconfigured");
    expect(snap.detection.situationTypes).toHaveLength(0);
    expect(snap.overallStatus).toBe("unconfigured");
    // Unconfigured domains have no critical issues
    expect(snap.criticalIssueCount).toBe(0);
  });

  // 2. Healthy department — connector active, entities exist, situations detected
  it("healthy department with active connector, people, and detections", async () => {
    setupEmptyDepartment();

    p.sourceConnector.findMany.mockResolvedValue([makeConnector()]);
    p.syncLog.findMany.mockResolvedValue([
      { connectorId: "conn1", createdAt: new Date("2026-03-20") },
    ]);
    mockEntityCount({ digitalExternal: 5, base: 3, byEntityType: { invoice: 5 } });
    p.entity.groupBy.mockResolvedValue([{ sourceSystem: "hubspot", _count: 5 }]);

    // Roles
    p.entityProperty.findMany.mockResolvedValue([{ id: "prop-role" }]);
    p.propertyValue.findMany.mockResolvedValue([
      { entityId: "e1" },
      { entityId: "e2" },
      { entityId: "e3" },
    ]);
    p.relationshipType.findFirst.mockResolvedValue({ id: "rt1" });
    p.relationship.findMany.mockResolvedValue([
      { fromEntityId: "e1" },
      { fromEntityId: "e2" },
    ]);

    // Documents + RAG
    p.internalDocument.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    p.$queryRaw.mockResolvedValue([{ count: BigInt(10) }]);

    // Insights
    p.operationalInsight.findMany.mockResolvedValue([
      { id: "ins1", promptModification: "mod" },
    ]);

    // Situation types
    const st = makeSituationType();
    p.situationType.findMany
      .mockResolvedValueOnce([st]) // knowledge coverage query
      .mockResolvedValueOnce([st]); // detection query
    p.situation.findMany.mockResolvedValue([
      { situationTypeId: "st1", createdAt: new Date("2026-03-19") },
    ]);
    p.entityType.findMany.mockResolvedValue([{ slug: "invoice" }]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    expect(snap.dataPipeline.status).toBe("healthy");
    expect(snap.knowledge.status).toBe("complete");
    expect(snap.detection.status).toBe("active");
    expect(snap.overallStatus).toBe("healthy");
    expect(snap.criticalIssueCount).toBe(0);
  });

  // 3. Disconnected connector → correct issue text and action
  it("disconnected connector produces correct issue and action", async () => {
    setupEmptyDepartment();
    p.sourceConnector.findMany.mockResolvedValue([
      makeConnector({ status: "disconnected", provider: "google" }),
    ]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    expect(snap.dataPipeline.status).toBe("disconnected");
    expect(snap.dataPipeline.connectors[0].issue).toBe("Authentication expired");
    expect(snap.dataPipeline.connectors[0].action).toEqual({
      label: "Reconnect",
      href: "/settings?tab=connections",
    });
    // Disconnected connector + knowledge empty = 2 critical issues
    expect(snap.criticalIssueCount).toBe(2);
    expect(snap.overallStatus).toBe("critical");
  });

  // 4. Situation type with no matching entities → "no_data"
  it("situation type with no matching entities diagnoses as no_data", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({ detectedCount: 0 });
    p.situationType.findMany
      .mockResolvedValueOnce([st]) // knowledge
      .mockResolvedValueOnce([st]); // detection
    p.entityType.findMany.mockResolvedValue([{ slug: "invoice" }]);
    // entity count for invoice type = 0 (default from setupEmptyDepartment)

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("no_data");
    expect(stHealth.diagnosisDetail).toContain("No invoice data");
    expect(stHealth.action).toEqual({
      label: "Connect tools",
      href: "/settings?tab=connections",
    });
  });

  // 5. Entities exist but zero detections → "no_matches"
  it("entities exist but zero detections diagnoses as no_matches", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({
      detectedCount: 0,
      confirmedCount: 0,
      dismissedCount: 0,
      createdAt: new Date("2026-01-01"),
    });
    p.situationType.findMany
      .mockResolvedValueOnce([st])
      .mockResolvedValueOnce([st]);
    p.entityType.findMany.mockResolvedValue([{ slug: "invoice" }]);
    // Entities of target type exist
    mockEntityCount({ byEntityType: { invoice: 8 } });

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("no_matches");
    expect(stHealth.diagnosisDetail).toContain("8 invoice records synced");
    expect(stHealth.diagnosisDetail).toContain("none match trigger conditions");
  });

  // 6. Low confirmation rate → "low_accuracy"
  it("low confirmation rate diagnoses as low_accuracy", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({
      detectedCount: 50,
      confirmedCount: 10, // 20% < 40% threshold
      dismissedCount: 30,
    });
    p.situationType.findMany
      .mockResolvedValueOnce([st])
      .mockResolvedValueOnce([st]);
    p.entityType.findMany.mockResolvedValue([{ slug: "invoice" }]);
    mockEntityCount({ byEntityType: { invoice: 10 } });

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("low_accuracy");
    expect(stHealth.diagnosisDetail).toContain("20%");
    expect(stHealth.action).toEqual({
      label: "Review",
      href: "/learning?type=st1",
    });
  });

  // 7. People without roles generate correct gap string
  it("people without roles produce correct gap message", async () => {
    setupEmptyDepartment();
    mockEntityCount({ base: 5 });
    p.entityProperty.findMany.mockResolvedValue([]); // no role/title properties

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    expect(snap.knowledge.people.count).toBe(5);
    expect(snap.knowledge.people.withRoles).toBe(0);
    expect(snap.knowledge.people.gaps).toContain(
      "5 team members have no role defined",
    );
    expect(snap.knowledge.people.gaps).toContain(
      "No reporting structure defined",
    );
  });

  // 8. Zero documents → documents section reflects it, people only → "minimal"
  it("zero documents reflected in knowledge section", async () => {
    setupEmptyDepartment();
    mockEntityCount({ base: 3 });
    p.entityProperty.findMany.mockResolvedValue([]);
    p.internalDocument.count.mockResolvedValue(0);
    p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    expect(snap.knowledge.documents.count).toBe(0);
    expect(snap.knowledge.documents.ragChunks).toBe(0);
    expect(snap.knowledge.documents.staleCount).toBe(0);
    expect(snap.knowledge.status).toBe("minimal"); // people only
  });
  // Content-mode situation type diagnosed correctly
  it("content-mode situation type with no detections diagnoses as no_data", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({
      detectedCount: 0,
      detectionLogic: JSON.stringify({ mode: "content" }),
      createdAt: new Date("2026-01-01"),
    });
    p.situationType.findMany
      .mockResolvedValueOnce([st])
      .mockResolvedValueOnce([st]);
    p.entityType.findMany.mockResolvedValue([]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("no_data");
    expect(stHealth.diagnosisDetail).toContain("communication connectors");
  });

  // Unknown entity type slug → "inactive"
  it("unknown entity type slug diagnoses as inactive", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({
      detectionLogic: JSON.stringify({
        mode: "structured",
        structured: { entityType: "nonexistent-type" },
      }),
    });
    p.situationType.findMany
      .mockResolvedValueOnce([st])
      .mockResolvedValueOnce([st]);
    // Entity type slugs do NOT include "nonexistent-type"
    p.entityType.findMany.mockResolvedValue([{ slug: "invoice" }]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("inactive");
    expect(stHealth.diagnosisDetail).toContain("unknown entity type");
    expect(stHealth.diagnosisDetail).toContain("nonexistent-type");
  });

  // Natural language only situation type (no target slug) with zero detections
  it("natural-language situation type with zero detections diagnoses as no_matches", async () => {
    setupEmptyDepartment();

    const st = makeSituationType({
      detectedCount: 0,
      detectionLogic: JSON.stringify({ mode: "natural", naturalLanguage: "Customer at risk of churn" }),
      createdAt: new Date("2026-01-01"),
    });
    p.situationType.findMany
      .mockResolvedValueOnce([st])
      .mockResolvedValueOnce([st]);
    p.entityType.findMany.mockResolvedValue([]);

    const snap = await computeDepartmentSnapshot(OP, DEPT);

    const stHealth = snap.detection.situationTypes[0];
    expect(stHealth.diagnosis).toBe("no_matches");
    expect(stHealth.diagnosisDetail).toContain("review detection description");
  });
});

// 9. Operator aggregate: worst department status bubbles up
describe("computeOperatorSnapshot", () => {
  it("worst department status bubbles up to operator level", async () => {
    p.entity.findMany.mockResolvedValueOnce([{ id: "dept-a" }, { id: "dept-b" }]);

    p.entity.findFirst
      .mockResolvedValueOnce({ displayName: "Sales" })
      .mockResolvedValueOnce({ displayName: "Support" });

    // Dept A: healthy connector; Dept B: disconnected connector
    p.sourceConnector.findMany
      .mockResolvedValueOnce([makeConnector({ id: "cA" })])
      .mockResolvedValueOnce([
        makeConnector({ id: "cB", provider: "stripe", status: "disconnected" }),
      ]);

    // Pipeline entity counts — both have 0 entities (simpler)
    mockEntityCount({});

    p.syncLog.findMany.mockResolvedValue([]);
    p.slackChannelMapping.findMany.mockResolvedValue([]);
    p.entity.groupBy.mockResolvedValue([]);
    p.entityProperty.findMany.mockResolvedValue([]);
    p.propertyValue.findMany.mockResolvedValue([]);
    p.relationshipType.findFirst.mockResolvedValue(null);
    p.relationship.findMany.mockResolvedValue([]);
    p.internalDocument.count.mockResolvedValue(0);
    p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    p.operationalInsight.findMany.mockResolvedValue([]);
    p.situationType.findMany.mockResolvedValue([]);
    p.situation.findMany.mockResolvedValue([]);
    p.entityType.findMany.mockResolvedValue([]);

    const snap = await computeOperatorSnapshot(OP);

    expect(snap.domains).toHaveLength(2);
    // Dept B has disconnected connector + empty knowledge → critical
    const deptB = snap.domains.find((d) => d.domainName === "Support");
    expect(deptB?.overallStatus).toBe("critical");
    // Operator overall should be worst = critical
    expect(snap.overallStatus).toBe("critical");
    expect(snap.criticalIssueCount).toBeGreaterThan(0);
  });
});

// 10. recomputeHealthSnapshots upserts correctly, no duplicates on double call
describe("recomputeHealthSnapshots", () => {
  it("upserts without duplicates when called twice", async () => {
    p.entity.findMany.mockResolvedValue([{ id: DEPT }]);
    p.entity.findFirst.mockResolvedValue({ displayName: DEPT_NAME });
    p.sourceConnector.findMany.mockResolvedValue([]);
    mockEntityCount({});
    p.entity.groupBy.mockResolvedValue([]);
    p.syncLog.findMany.mockResolvedValue([]);
    p.slackChannelMapping.findMany.mockResolvedValue([]);
    p.entityProperty.findMany.mockResolvedValue([]);
    p.propertyValue.findMany.mockResolvedValue([]);
    p.relationshipType.findFirst.mockResolvedValue(null);
    p.relationship.findMany.mockResolvedValue([]);
    p.internalDocument.count.mockResolvedValue(0);
    p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    p.operationalInsight.findMany.mockResolvedValue([]);
    p.situationType.findMany.mockResolvedValue([]);
    p.situation.findMany.mockResolvedValue([]);
    p.entityType.findMany.mockResolvedValue([]);
    p.$transaction.mockResolvedValue(undefined);

    await recomputeHealthSnapshots(OP);
    await recomputeHealthSnapshots(OP);

    // $transaction called twice (once per call)
    expect(p.$transaction).toHaveBeenCalledTimes(2);
  });

  it("single-department recompute upserts department + rebuilds aggregate from persisted rows", async () => {
    p.entity.findFirst.mockResolvedValue({ displayName: DEPT_NAME });
    p.sourceConnector.findMany.mockResolvedValue([]);
    mockEntityCount({});
    p.entity.groupBy.mockResolvedValue([]);
    p.syncLog.findMany.mockResolvedValue([]);
    p.slackChannelMapping.findMany.mockResolvedValue([]);
    p.entityProperty.findMany.mockResolvedValue([]);
    p.propertyValue.findMany.mockResolvedValue([]);
    p.relationshipType.findFirst.mockResolvedValue(null);
    p.relationship.findMany.mockResolvedValue([]);
    p.internalDocument.count.mockResolvedValue(0);
    p.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    p.operationalInsight.findMany.mockResolvedValue([]);
    p.situationType.findMany.mockResolvedValue([]);
    p.situation.findMany.mockResolvedValue([]);
    p.entityType.findMany.mockResolvedValue([]);
    p.domainHealth.upsert.mockResolvedValue({});
    // Return persisted department snapshots for aggregate rebuild
    p.domainHealth.findMany.mockResolvedValue([
      {
        snapshot: {
          domainId: DEPT,
          domainName: DEPT_NAME,
          overallStatus: "unconfigured",
          criticalIssueCount: 0,
        },
      },
    ]);
    p.$executeRaw.mockResolvedValue(1);

    await recomputeHealthSnapshots(OP, DEPT);

    // Upserts the single department
    expect(p.domainHealth.upsert).toHaveBeenCalledTimes(1);
    expect(p.domainHealth.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operatorId_domainEntityId: {
            operatorId: OP,
            domainEntityId: DEPT,
          },
        },
      }),
    );
    // Reads persisted rows for aggregate (no full recompute)
    expect(p.domainHealth.findMany).toHaveBeenCalledTimes(1);
    // Writes operator aggregate via raw SQL
    expect(p.$executeRaw).toHaveBeenCalledTimes(1);
    // Should NOT call entity.findMany for domains (no full recompute)
    expect(p.entity.findMany).not.toHaveBeenCalled();
  });

  it("never throws even on database error", async () => {
    p.entity.findFirst.mockRejectedValue(new Error("DB connection lost"));

    await expect(recomputeHealthSnapshots(OP)).resolves.toBeUndefined();
  });
});
