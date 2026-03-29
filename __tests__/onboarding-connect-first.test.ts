import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma Mock ──────────────────────────────────────────────────────────────

const mockSessionFindFirst = vi.fn();
const mockSessionUpdate = vi.fn();
const mockAnalysisFindUnique = vi.fn();
const mockAnalysisUpdateMany = vi.fn();
const mockEntityFindFirst = vi.fn();
const mockEntityUpdate = vi.fn();
const mockEntityCreate = vi.fn();
const mockEntityTypeFindFirst = vi.fn();
const mockPropertyValueFindFirst = vi.fn();
const mockConnectorFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    orientationSession: {
      findFirst: (...a: unknown[]) => mockSessionFindFirst(...a),
      update: (...a: unknown[]) => mockSessionUpdate(...a),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    onboardingAnalysis: {
      findUnique: (...a: unknown[]) => mockAnalysisFindUnique(...a),
      updateMany: (...a: unknown[]) => mockAnalysisUpdateMany(...a),
    },
    entity: {
      findFirst: (...a: unknown[]) => mockEntityFindFirst(...a),
      update: (...a: unknown[]) => mockEntityUpdate(...a),
      create: (...a: unknown[]) => mockEntityCreate(...a),
    },
    entityType: {
      findFirst: (...a: unknown[]) => mockEntityTypeFindFirst(...a),
    },
    propertyValue: {
      findFirst: (...a: unknown[]) => mockPropertyValueFindFirst(...a),
    },
    sourceConnector: {
      findMany: (...a: unknown[]) => mockConnectorFindMany(...a),
    },
    contentChunk: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: "user1", role: "admin", operator: { id: "op1" } },
    operatorId: "op1",
    isSuperadmin: false,
    actingAsOperator: null,
  }),
}));

vi.mock("@/lib/internal-api", () => ({
  getBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

vi.mock("@/lib/onboarding-intelligence/progress", () => ({
  estimateMinutesRemaining: vi.fn().mockReturnValue(15),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { PATCH as advancePatch } from "@/app/api/orientation/advance/route";
import { GET as getAnalysisProgress } from "@/app/api/onboarding/analysis-progress/route";
import { POST as confirmStructure } from "@/app/api/onboarding/confirm-structure/route";
import { NextRequest } from "next/server";

function makeReq(method: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest("http://localhost/api/test", init);
}

// ── 1. Phase Transitions ────────────────────────────────────────────────────

describe("OrientationSession phase transitions (connect-first flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances from mapping → connecting", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "mapping",
      context: null,
    });
    mockSessionUpdate.mockResolvedValue({
      id: "sess1",
      phase: "connecting",
    });

    const res = await advancePatch(makeReq("PATCH", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.phase).toBe("connecting");
  });

  it("advances from connecting → syncing", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "connecting",
      context: null,
    });
    mockSessionUpdate.mockResolvedValue({
      id: "sess1",
      phase: "syncing",
    });

    const res = await advancePatch(makeReq("PATCH", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.phase).toBe("syncing");
  });

  it("advances from syncing → analyzing", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "syncing",
      context: null,
    });
    mockSessionUpdate.mockResolvedValue({
      id: "sess1",
      phase: "analyzing",
    });

    const res = await advancePatch(makeReq("PATCH", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.phase).toBe("analyzing");
  });

  it("advances from analyzing → confirming", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "analyzing",
      context: null,
    });
    mockSessionUpdate.mockResolvedValue({
      id: "sess1",
      phase: "confirming",
    });

    const res = await advancePatch(makeReq("PATCH", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.phase).toBe("confirming");
  });

  it("supports targetPhase to skip to orienting", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "confirming",
      context: null,
    });
    mockSessionUpdate.mockResolvedValue({
      id: "sess1",
      phase: "orienting",
    });

    const res = await advancePatch(makeReq("PATCH", { targetPhase: "orienting" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.phase).toBe("orienting");
  });

  it("rejects backwards phase transitions", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "analyzing",
      context: null,
    });

    const res = await advancePatch(makeReq("PATCH", { targetPhase: "mapping" }));
    expect(res.status).toBe(422);
  });

  it("rejects invalid target phase", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess1",
      operatorId: "op1",
      phase: "connecting",
      context: null,
    });

    const res = await advancePatch(makeReq("PATCH", { targetPhase: "nonexistent" }));
    expect(res.status).toBe(400);
  });

  it("full new phase sequence: mapping→connecting→syncing→analyzing→confirming→orienting→active", async () => {
    const phases = ["mapping", "connecting", "syncing", "analyzing", "confirming", "orienting"];
    const expected = ["connecting", "syncing", "analyzing", "confirming", "orienting", "active"];

    for (let i = 0; i < phases.length; i++) {
      mockSessionFindFirst.mockResolvedValue({
        id: "sess1",
        operatorId: "op1",
        phase: phases[i],
        context: null,
      });
      mockSessionUpdate.mockResolvedValue({
        id: "sess1",
        phase: expected[i],
        ...(expected[i] === "active" ? { completedAt: new Date() } : {}),
      });

      const res = await advancePatch(makeReq("PATCH", {}));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.phase).toBe(expected[i]);
    }
  });
});

// ── 2. Analysis Progress ────────────────────────────────────────────────────

describe("GET /api/onboarding/analysis-progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns progress messages during analysis", async () => {
    mockAnalysisFindUnique.mockResolvedValue({
      operatorId: "op1",
      status: "analyzing",
      currentPhase: "round_1",
      progressMessages: [
        { timestamp: "2026-03-23T14:02:00Z", message: "Scanning systems...", agentName: "People Discovery" },
      ],
      synthesisOutput: null,
      uncertaintyLog: null,
    });

    const res = await getAnalysisProgress();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe("analyzing");
    expect(data.currentPhase).toBe("round_1");
    expect(data.progressMessages).toHaveLength(1);
    expect(data.progressMessages[0].agentName).toBe("People Discovery");
    expect(data.estimatedMinutesRemaining).toBe(15);
  });

  it("includes synthesisOutput and uncertaintyLog when confirming", async () => {
    const synthesisOutput = {
      departments: [{ name: "Engineering", headCount: 12, keyPeople: ["Alice"], functions: ["Development"] }],
      people: [{ name: "Alice", email: "alice@test.com", department: "Engineering", role: "Lead", relationships: [] }],
      processes: [],
      relationships: [],
      knowledgeInventory: [],
      situationRecommendations: [],
    };
    const uncertaintyLog = [
      { question: "Is Thomas the lead?", context: "Calendar shows weekly 1:1s", possibleAnswers: ["Yes", "No"] },
    ];

    mockAnalysisFindUnique.mockResolvedValue({
      operatorId: "op1",
      status: "confirming",
      currentPhase: "synthesis",
      progressMessages: [],
      synthesisOutput,
      uncertaintyLog,
    });

    const res = await getAnalysisProgress();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe("confirming");
    expect(data.synthesisOutput).toBeDefined();
    expect(data.synthesisOutput.departments).toHaveLength(1);
    expect(data.uncertaintyLog).toHaveLength(1);
  });

  it("does not include synthesisOutput when still analyzing", async () => {
    mockAnalysisFindUnique.mockResolvedValue({
      operatorId: "op1",
      status: "analyzing",
      currentPhase: "round_0",
      progressMessages: [],
      synthesisOutput: { departments: [] },
      uncertaintyLog: null,
    });

    const res = await getAnalysisProgress();
    const data = await res.json();

    expect(data.synthesisOutput).toBeUndefined();
  });

  it("returns 404 when no analysis exists", async () => {
    mockAnalysisFindUnique.mockResolvedValue(null);

    const res = await getAnalysisProgress();
    expect(res.status).toBe(404);
  });
});

// ── 3. Confirm Structure ────────────────────────────────────────────────────

describe("POST /api/onboarding/confirm-structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalysisUpdateMany.mockResolvedValue({ count: 1 });
    // Mock fetch for cron trigger
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("confirms without edits", async () => {
    const res = await confirmStructure(makeReq("POST", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockAnalysisUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "complete" },
      }),
    );
  });

  it("applies department renames", async () => {
    mockEntityFindFirst.mockResolvedValue({
      id: "dept1",
      operatorId: "op1",
      displayName: "Engineering",
      status: "active",
    });
    mockEntityUpdate.mockResolvedValue({ id: "dept1" });

    const res = await confirmStructure(
      makeReq("POST", {
        edits: {
          renamedDepartments: [{ oldName: "Engineering", newName: "Product & Engineering" }],
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockEntityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dept1" },
        data: { displayName: "Product & Engineering" },
      }),
    );
  });

  it("archives deleted departments", async () => {
    mockEntityFindFirst.mockResolvedValue({
      id: "dept2",
      operatorId: "op1",
      displayName: "Old Dept",
      status: "active",
    });
    mockEntityUpdate.mockResolvedValue({ id: "dept2" });

    const res = await confirmStructure(
      makeReq("POST", {
        edits: { deletedDepartments: ["Old Dept"] },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockEntityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "archived" },
      }),
    );
  });

  it("moves people between departments", async () => {
    mockPropertyValueFindFirst.mockResolvedValue({
      entity: { id: "person1", operatorId: "op1" },
    });
    mockEntityFindFirst.mockResolvedValue({
      id: "dept3",
      operatorId: "op1",
      displayName: "Sales",
      status: "active",
    });
    mockEntityUpdate.mockResolvedValue({ id: "person1" });

    const res = await confirmStructure(
      makeReq("POST", {
        edits: {
          movedPeople: [{ email: "alice@test.com", toDepartment: "Sales" }],
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockEntityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "person1" },
        data: { parentDepartmentId: "dept3" },
      }),
    );
  });

  it("archives deleted people", async () => {
    mockPropertyValueFindFirst.mockResolvedValue({
      entity: { id: "person2", operatorId: "op1" },
    });
    mockEntityUpdate.mockResolvedValue({ id: "person2" });

    const res = await confirmStructure(
      makeReq("POST", {
        edits: { deletedPeople: ["bob@test.com"] },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockEntityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "archived" },
      }),
    );
  });

  it("creates new departments", async () => {
    mockEntityTypeFindFirst.mockResolvedValue({ id: "type-dept" });
    mockEntityFindFirst.mockResolvedValue(null); // no existing dept
    mockEntityCreate.mockResolvedValue({ id: "new-dept" });

    const res = await confirmStructure(
      makeReq("POST", {
        edits: {
          addedDepartments: [{ name: "Marketing", description: "Marketing team" }],
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockEntityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          displayName: "Marketing",
          category: "foundational",
          sourceSystem: "onboarding-intelligence",
        }),
      }),
    );
  });
});

// ── 4. Step Determination Logic ─────────────────────────────────────────────

describe("Step determination logic", () => {
  // Testing the logic from page.tsx as pure functions

  function determineStep(
    phase: string | null,
    analysisStatus: string | null,
    connectorCount: number,
  ): number {
    if (phase === "orienting") return -1; // redirect to /copilot
    if (phase === "active") return -2; // redirect to /map
    if (analysisStatus === "confirming") return 4;
    if (analysisStatus === "analyzing") return 3;
    if (phase === "analyzing" || phase === "syncing") return 3;
    if (phase === "confirming") return 4;
    if (phase === "connecting") return 2;
    if (!phase || phase === "mapping") return 1;
    return 1;
  }

  it("returns Step 1 for new session (no phase)", () => {
    expect(determineStep(null, null, 0)).toBe(1);
  });

  it("returns Step 1 for mapping phase", () => {
    expect(determineStep("mapping", null, 0)).toBe(1);
  });

  it("returns Step 2 for connecting phase", () => {
    expect(determineStep("connecting", null, 0)).toBe(2);
  });

  it("returns Step 3 for syncing phase", () => {
    expect(determineStep("syncing", null, 0)).toBe(3);
  });

  it("returns Step 3 for analyzing phase", () => {
    expect(determineStep("analyzing", null, 0)).toBe(3);
  });

  it("returns Step 3 when analysis status is analyzing", () => {
    expect(determineStep("analyzing", "analyzing", 3)).toBe(3);
  });

  it("returns Step 4 for confirming phase", () => {
    expect(determineStep("confirming", null, 3)).toBe(4);
  });

  it("returns Step 4 when analysis status is confirming", () => {
    expect(determineStep("analyzing", "confirming", 3)).toBe(4);
  });

  it("redirects to /copilot for orienting phase", () => {
    expect(determineStep("orienting", null, 5)).toBe(-1);
  });

  it("redirects to /map for active phase", () => {
    expect(determineStep("active", null, 5)).toBe(-2);
  });

  it("resume: browser close during analysis → returns Step 3", () => {
    expect(determineStep("syncing", "analyzing", 3)).toBe(3);
  });

  it("resume: browser close during confirmation → returns Step 4", () => {
    expect(determineStep("confirming", "confirming", 5)).toBe(4);
  });
});

// ── 5. Connector Detection Logic ────────────────────────────────────────────

describe("Connector detection logic", () => {
  const GOOGLE_WORKSPACE_PROVIDERS = ["google-gmail", "google-drive", "google-calendar", "google-sheets", "google"];
  const MICROSOFT_PROVIDERS = ["microsoft-365", "microsoft"];

  function isGoogleWorkspaceConnected(connectors: { provider: string }[]) {
    return GOOGLE_WORKSPACE_PROVIDERS.some(p => connectors.some(c => c.provider === p));
  }

  function isMicrosoftConnected(connectors: { provider: string }[]) {
    return MICROSOFT_PROVIDERS.some(p => connectors.some(c => c.provider === p));
  }

  it("detects Google Workspace via google provider", () => {
    expect(isGoogleWorkspaceConnected([{ provider: "google" }])).toBe(true);
  });

  it("detects Google Workspace via google-gmail provider", () => {
    expect(isGoogleWorkspaceConnected([{ provider: "google-gmail" }])).toBe(true);
  });

  it("detects Microsoft via microsoft provider", () => {
    expect(isMicrosoftConnected([{ provider: "microsoft" }])).toBe(true);
  });

  it("detects Microsoft via microsoft-365 provider", () => {
    expect(isMicrosoftConnected([{ provider: "microsoft-365" }])).toBe(true);
  });

  it("returns false when no workspace connected", () => {
    expect(isGoogleWorkspaceConnected([{ provider: "hubspot" }])).toBe(false);
    expect(isMicrosoftConnected([{ provider: "hubspot" }])).toBe(false);
  });

  it("counts unique connected providers", () => {
    const connectors = [
      { provider: "google" },
      { provider: "hubspot" },
      { provider: "slack" },
      { provider: "stripe" },
    ];
    const totalConnected = new Set(connectors.map(c => c.provider)).size;
    expect(totalConnected).toBe(4);
  });
});

// ── 6. Confidence Message Logic ─────────────────────────────────────────────

describe("Confidence indicator logic", () => {
  function getConfidenceLevel(count: number): string {
    if (count >= 6) return "excellent";
    if (count >= 3) return "good";
    if (count >= 1) return "basic";
    return "none";
  }

  it("returns none for 0 tools", () => {
    expect(getConfidenceLevel(0)).toBe("none");
  });

  it("returns basic for 1-2 tools", () => {
    expect(getConfidenceLevel(1)).toBe("basic");
    expect(getConfidenceLevel(2)).toBe("basic");
  });

  it("returns good for 3-5 tools", () => {
    expect(getConfidenceLevel(3)).toBe("good");
    expect(getConfidenceLevel(5)).toBe("good");
  });

  it("returns excellent for 6+ tools", () => {
    expect(getConfidenceLevel(6)).toBe("excellent");
    expect(getConfidenceLevel(10)).toBe("excellent");
  });
});

// ── 7. Uncertainty Answer Collection ────────────────────────────────────────

describe("Uncertainty answer collection", () => {
  it("collects answers indexed by question number", () => {
    const answers: Record<number, string> = {};
    answers[0] = "Thomas reports to Maria";
    answers[1] = "Separate department";
    answers[2] = "No, discontinued";

    expect(Object.keys(answers)).toHaveLength(3);
    expect(answers[0]).toBe("Thomas reports to Maria");
  });

  it("allows free-text answers that override multiple choice", () => {
    const answers: Record<number, string> = {};
    const possibleAnswers = ["Yes", "No"];

    // User selects "Yes"
    answers[0] = "Yes";
    expect(possibleAnswers.includes(answers[0])).toBe(true);

    // User types custom answer
    answers[0] = "Only partially active";
    expect(possibleAnswers.includes(answers[0])).toBe(false);
    expect(answers[0]).toBe("Only partially active");
  });
});

// ── 8. Edit Tracking ────────────────────────────────────────────────────────

describe("Edit tracking for confirm step", () => {
  interface CompanyModelEditsTest {
    renamedDepartments?: Array<{ oldName: string; newName: string }>;
    deletedDepartments?: string[];
    movedPeople?: Array<{ email: string; toDepartment: string }>;
    deletedPeople?: string[];
    addedDepartments?: Array<{ name: string; description?: string }>;
  }

  it("tracks department renames without duplicates", () => {
    const edits: CompanyModelEditsTest = { renamedDepartments: [] };

    // First rename
    edits.renamedDepartments = [
      ...(edits.renamedDepartments || []).filter(r => r.oldName !== "Eng"),
      { oldName: "Eng", newName: "Engineering" },
    ];
    expect(edits.renamedDepartments).toHaveLength(1);

    // Update same rename
    edits.renamedDepartments = [
      ...(edits.renamedDepartments || []).filter(r => r.oldName !== "Eng"),
      { oldName: "Eng", newName: "Product & Engineering" },
    ];
    expect(edits.renamedDepartments).toHaveLength(1);
    expect(edits.renamedDepartments[0].newName).toBe("Product & Engineering");
  });

  it("tracks unique department deletions", () => {
    const edits: CompanyModelEditsTest = { deletedDepartments: [] };

    edits.deletedDepartments = [...new Set([...(edits.deletedDepartments || []), "Old Dept"])];
    edits.deletedDepartments = [...new Set([...(edits.deletedDepartments || []), "Old Dept"])]; // duplicate
    expect(edits.deletedDepartments).toHaveLength(1);
  });

  it("tracks person moves with latest destination", () => {
    const edits: CompanyModelEditsTest = { movedPeople: [] };

    // Move to Sales
    edits.movedPeople = [
      ...(edits.movedPeople || []).filter(m => m.email !== "alice@test.com"),
      { email: "alice@test.com", toDepartment: "Sales" },
    ];

    // Change mind — move to Marketing
    edits.movedPeople = [
      ...(edits.movedPeople || []).filter(m => m.email !== "alice@test.com"),
      { email: "alice@test.com", toDepartment: "Marketing" },
    ];

    expect(edits.movedPeople).toHaveLength(1);
    expect(edits.movedPeople[0].toDepartment).toBe("Marketing");
  });

  it("can undo department deletion", () => {
    let deletedDepartments = ["Engineering", "HR"];

    // Undo HR deletion
    deletedDepartments = deletedDepartments.filter(d => d !== "HR");
    expect(deletedDepartments).toEqual(["Engineering"]);
  });
});

// ── 9. Analysis Phase Estimate Labels ───────────────────────────────────────

describe("Analysis phase estimate labels", () => {
  function getEstimateLabel(phase: string): string {
    switch (phase) {
      case "idle":
      case "syncing":
      case "round_0":
        return "15-30 minutes";
      case "round_1":
        return "10-20 minutes remaining";
      case "organizer_1":
      case "round_2":
      case "organizer_2":
      case "round_3":
        return "5-10 minutes remaining";
      case "synthesis":
        return "Almost done...";
      default:
        return "15-30 minutes";
    }
  }

  it("returns long estimate for round_0", () => {
    expect(getEstimateLabel("round_0")).toBe("15-30 minutes");
  });

  it("returns medium estimate for round_1", () => {
    expect(getEstimateLabel("round_1")).toBe("10-20 minutes remaining");
  });

  it("returns short estimate for round_2", () => {
    expect(getEstimateLabel("round_2")).toBe("5-10 minutes remaining");
  });

  it("returns almost done for synthesis", () => {
    expect(getEstimateLabel("synthesis")).toBe("Almost done...");
  });
});

// ── 10. OAuth Return Detection ──────────────────────────────────────────────

describe("OAuth return detection", () => {
  const ALL_PROVIDERS = [
    "workspace", "google", "microsoft", "slack", "hubspot", "stripe",
    "google-ads", "shopify", "linkedin", "meta-ads",
    "pipedrive", "salesforce", "intercom", "zendesk",
  ];

  function isOAuthReturn(params: Record<string, string>): boolean {
    return ALL_PROVIDERS.some(p => params[p] === "connected");
  }

  it("detects Google Workspace return", () => {
    expect(isOAuthReturn({ workspace: "connected" })).toBe(true);
  });

  it("detects Slack return", () => {
    expect(isOAuthReturn({ slack: "connected" })).toBe(true);
  });

  it("detects HubSpot return", () => {
    expect(isOAuthReturn({ hubspot: "connected" })).toBe(true);
  });

  it("returns false for no OAuth params", () => {
    expect(isOAuthReturn({})).toBe(false);
  });

  it("returns false for error params", () => {
    expect(isOAuthReturn({ google: "error" })).toBe(false);
  });
});

// ── 11. OnboardingStep Type Constraint ──────────────────────────────────────

describe("OnboardingStep type", () => {
  type OnboardingStep = 1 | 2 | 3 | 4;

  it("only allows 4 steps", () => {
    const validSteps: OnboardingStep[] = [1, 2, 3, 4];
    expect(validSteps).toHaveLength(4);
    expect(validSteps).toEqual([1, 2, 3, 4]);
  });

  it("step labels match step count", () => {
    const labels = ["Company", "Tools", "Analysis", "Confirm"];
    expect(labels).toHaveLength(4);
  });
});

// ── 12. Phase Order Validation ──────────────────────────────────────────────

describe("New phase order validation", () => {
  const PHASE_ORDER = ["mapping", "connecting", "syncing", "analyzing", "confirming", "orienting", "active"];

  it("has 7 phases in correct order", () => {
    expect(PHASE_ORDER).toHaveLength(7);
    expect(PHASE_ORDER[0]).toBe("mapping");
    expect(PHASE_ORDER[1]).toBe("connecting");
    expect(PHASE_ORDER[2]).toBe("syncing");
    expect(PHASE_ORDER[3]).toBe("analyzing");
    expect(PHASE_ORDER[4]).toBe("confirming");
    expect(PHASE_ORDER[5]).toBe("orienting");
    expect(PHASE_ORDER[6]).toBe("active");
  });

  it("old phases (populating) are removed", () => {
    expect(PHASE_ORDER).not.toContain("populating");
  });

  it("connecting comes before syncing", () => {
    expect(PHASE_ORDER.indexOf("connecting")).toBeLessThan(PHASE_ORDER.indexOf("syncing"));
  });

  it("analyzing comes after syncing", () => {
    expect(PHASE_ORDER.indexOf("analyzing")).toBeGreaterThan(PHASE_ORDER.indexOf("syncing"));
  });

  it("confirming comes after analyzing", () => {
    expect(PHASE_ORDER.indexOf("confirming")).toBeGreaterThan(PHASE_ORDER.indexOf("analyzing"));
  });
});
