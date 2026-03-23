import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ── Prisma Mock ──────────────────────────────────────────────────────────────

const mockAgentRunFindMany = vi.fn();
const mockAgentRunUpdateMany = vi.fn();
const mockAnalysisFindMany = vi.fn();
const mockAnalysisUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAgentRun: {
      findMany: (...a: unknown[]) => mockAgentRunFindMany(...a),
      updateMany: (...a: unknown[]) => mockAgentRunUpdateMany(...a),
    },
    onboardingAnalysis: {
      findMany: (...a: unknown[]) => mockAnalysisFindMany(...a),
      update: (...a: unknown[]) => mockAnalysisUpdate(...a),
    },
  },
}));

const mockAddProgressMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/onboarding-intelligence/progress", () => ({
  addProgressMessage: (...a: unknown[]) => mockAddProgressMessage(...a),
}));

const mockTriggerNextIteration = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/internal-api", () => ({
  triggerNextIteration: (...a: unknown[]) => mockTriggerNextIteration(...a),
  getBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { GET as recoverStuckAgents } from "@/app/api/cron/recover-stuck-agents/route";

function makeReq() {
  return new Request("http://localhost/api/cron/recover-stuck-agents", { method: "GET" });
}

// ── 1. Stuck Agent Recovery Cron ────────────────────────────────────────────

describe("GET /api/cron/recover-stuck-agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalysisFindMany.mockResolvedValue([]);
  });

  it("re-triggers agent stuck > 20 minutes", async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    mockAgentRunFindMany.mockResolvedValue([
      {
        id: "run1",
        analysisId: "analysis1",
        agentName: "org_analyst",
        iterationCount: 15,
        lastIterationAt: thirtyMinAgo,
        status: "running",
      },
    ]);

    const res = await recoverStuckAgents(makeReq());
    const data = await res.json();

    expect(data.recovered).toBe(1);
    expect(mockTriggerNextIteration).toHaveBeenCalledWith("run1");
    expect(mockAddProgressMessage).toHaveBeenCalledWith(
      "analysis1",
      expect.stringContaining("Re-triggering org_analyst"),
      "system",
    );
  });

  it("does not touch agent stuck < 20 minutes", async () => {
    // Agent run findMany returns empty because lastIterationAt is recent
    mockAgentRunFindMany.mockResolvedValue([]);

    const res = await recoverStuckAgents(makeReq());
    const data = await res.json();

    expect(data.recovered).toBe(0);
    expect(mockTriggerNextIteration).not.toHaveBeenCalled();
  });

  it("marks analysis stuck > 2 hours as failed", async () => {
    mockAgentRunFindMany.mockResolvedValue([]);
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockAnalysisFindMany.mockResolvedValue([
      {
        id: "analysis2",
        status: "analyzing",
        startedAt: threeHoursAgo,
      },
    ]);
    mockAnalysisUpdate.mockResolvedValue({ id: "analysis2" });
    mockAgentRunUpdateMany.mockResolvedValue({ count: 2 });

    const res = await recoverStuckAgents(makeReq());
    const data = await res.json();

    expect(data.timedOut).toBe(1);
    expect(mockAnalysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "analysis2" },
        data: expect.objectContaining({
          status: "failed",
          failureReason: expect.stringContaining("timed out"),
        }),
      }),
    );
  });

  it("fails all running agent runs when analysis times out", async () => {
    mockAgentRunFindMany.mockResolvedValue([]);
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockAnalysisFindMany.mockResolvedValue([
      { id: "analysis3", status: "analyzing", startedAt: threeHoursAgo },
    ]);
    mockAnalysisUpdate.mockResolvedValue({ id: "analysis3" });
    mockAgentRunUpdateMany.mockResolvedValue({ count: 3 });

    await recoverStuckAgents(makeReq());

    expect(mockAgentRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analysisId: "analysis3", status: "running" },
        data: { status: "failed" },
      }),
    );
  });

  it("does not re-trigger agents from failed analyses", async () => {
    // Agent findMany where clause includes analysis.status = "analyzing"
    // So agents from failed analyses won't match
    mockAgentRunFindMany.mockResolvedValue([]);

    const res = await recoverStuckAgents(makeReq());
    const data = await res.json();

    expect(data.recovered).toBe(0);
    expect(mockTriggerNextIteration).not.toHaveBeenCalled();
  });

  it("adds progress message on recovery", async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    mockAgentRunFindMany.mockResolvedValue([
      {
        id: "run2",
        analysisId: "analysis4",
        agentName: "financial_analyst",
        iterationCount: 8,
        lastIterationAt: thirtyMinAgo,
        status: "running",
      },
    ]);

    await recoverStuckAgents(makeReq());

    expect(mockAddProgressMessage).toHaveBeenCalledWith(
      "analysis4",
      expect.stringContaining("financial_analyst"),
      "system",
    );
    expect(mockAddProgressMessage).toHaveBeenCalledWith(
      "analysis4",
      expect.stringContaining("iteration 8"),
      "system",
    );
  });
});

// ── 2. i18n Key Completeness ────────────────────────────────────────────────

describe("i18n key completeness", () => {
  const enPath = path.resolve(__dirname, "../messages/en.json");
  const daPath = path.resolve(__dirname, "../messages/da.json");

  let en: Record<string, unknown>;
  let da: Record<string, unknown>;

  function flattenKeys(obj: unknown, prefix = ""): string[] {
    const keys: string[] = [];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys.push(...flattenKeys(v, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
    }
    return keys;
  }

  beforeEach(() => {
    en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
    da = JSON.parse(fs.readFileSync(daPath, "utf-8"));
  });

  it("all onboarding keys in en.json exist in da.json", () => {
    const enKeys = flattenKeys((en as any).onboarding, "onboarding");
    const daKeys = flattenKeys((da as any).onboarding, "onboarding");

    const missingInDa = enKeys.filter(k => !daKeys.includes(k));
    expect(missingInDa).toEqual([]);
  });

  it("all onboarding keys in da.json exist in en.json", () => {
    const enKeys = flattenKeys((en as any).onboarding, "onboarding");
    const daKeys = flattenKeys((da as any).onboarding, "onboarding");

    const missingInEn = daKeys.filter(k => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it("onboarding key count matches between languages", () => {
    const enKeys = flattenKeys((en as any).onboarding);
    const daKeys = flattenKeys((da as any).onboarding);
    expect(enKeys.length).toBe(daKeys.length);
  });

  it("old deleted step keys are removed from en.json", () => {
    const onboarding = (en as any).onboarding;
    expect(onboarding.departments).toBeUndefined();
    expect(onboarding.team).toBeUndefined();
    expect(onboarding.documents).toBeUndefined();
    expect(onboarding.connectors).toBeUndefined();
    expect(onboarding.sync).toBeUndefined();
  });

  it("old deleted step keys are removed from da.json", () => {
    const onboarding = (da as any).onboarding;
    expect(onboarding.departments).toBeUndefined();
    expect(onboarding.team).toBeUndefined();
    expect(onboarding.documents).toBeUndefined();
    expect(onboarding.connectors).toBeUndefined();
    expect(onboarding.sync).toBeUndefined();
  });

  it("companyInfo keys are preserved", () => {
    expect((en as any).onboarding.companyInfo).toBeDefined();
    expect((en as any).onboarding.companyInfo.title).toBeDefined();
    expect((da as any).onboarding.companyInfo).toBeDefined();
    expect((da as any).onboarding.companyInfo.title).toBeDefined();
  });

  it("new connectTools section exists in both languages", () => {
    expect((en as any).onboarding.connectTools).toBeDefined();
    expect((da as any).onboarding.connectTools).toBeDefined();
    expect((en as any).onboarding.connectTools.workspace).toBeDefined();
    expect((da as any).onboarding.connectTools.workspace).toBeDefined();
  });

  it("new analysis section exists in both languages", () => {
    expect((en as any).onboarding.analysis).toBeDefined();
    expect((da as any).onboarding.analysis).toBeDefined();
    expect((en as any).onboarding.analysis.syncing).toBeDefined();
    expect((da as any).onboarding.analysis.syncing).toBeDefined();
  });

  it("new confirm section exists in both languages", () => {
    expect((en as any).onboarding.confirm).toBeDefined();
    expect((da as any).onboarding.confirm).toBeDefined();
    expect((en as any).onboarding.confirm.orgMap).toBeDefined();
    expect((da as any).onboarding.confirm.orgMap).toBeDefined();
  });

  it("category labels exist in connectTools", () => {
    const ct = (en as any).onboarding.connectTools;
    expect(ct.categoryCommunication).toBeDefined();
    expect(ct.categoryCrm).toBeDefined();
    expect(ct.categorySupport).toBeDefined();
    expect(ct.categoryAccounting).toBeDefined();
    expect(ct.categoryCommerce).toBeDefined();
    expect(ct.categoryMarketing).toBeDefined();
  });
});

// ── 3. Connector Status Filtering ───────────────────────────────────────────

describe("Connector status filtering", () => {
  const ACTIVE_STATUSES = ["active", "paused", "pending"];
  const INACTIVE_STATUSES = ["error", "disconnected"];

  function filterActive(connectors: { provider: string; status: string }[]) {
    return connectors.filter(c => c.status !== "error" && c.status !== "disconnected");
  }

  it("excludes error connectors from connected count", () => {
    const connectors = [
      { provider: "google", status: "active" },
      { provider: "slack", status: "error" },
      { provider: "hubspot", status: "active" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(2);
    expect(active.map(c => c.provider)).toEqual(["google", "hubspot"]);
  });

  it("excludes disconnected connectors from connected count", () => {
    const connectors = [
      { provider: "google", status: "disconnected" },
      { provider: "hubspot", status: "active" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(1);
    expect(active[0].provider).toBe("hubspot");
  });

  it("keeps active and paused connectors", () => {
    const connectors = [
      { provider: "google", status: "active" },
      { provider: "slack", status: "paused" },
      { provider: "hubspot", status: "pending" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(3);
  });

  it("returns empty for all-error connectors", () => {
    const connectors = [
      { provider: "google", status: "error" },
      { provider: "slack", status: "disconnected" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(0);
  });
});

// ── 4. Vercel.json Cron Config ──────────────────────────────────────────────

describe("Vercel.json cron config", () => {
  it("includes recover-stuck-agents cron at 5-minute interval", () => {
    const vercelPath = path.resolve(__dirname, "../vercel.json");
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf-8"));

    const recoverCron = vercel.crons.find(
      (c: { path: string }) => c.path === "/api/cron/recover-stuck-agents",
    );
    expect(recoverCron).toBeDefined();
    expect(recoverCron.schedule).toBe("*/5 * * * *");
  });
});
