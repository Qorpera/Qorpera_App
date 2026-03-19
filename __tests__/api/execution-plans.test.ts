import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    executionPlan: { findFirst: vi.fn() },
    executionStep: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/execution-engine", () => ({
  advanceStep: vi.fn(),
  completeHumanStep: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { advanceStep, completeHumanStep } from "@/lib/execution-engine";
import { GET } from "@/app/api/execution-plans/[planId]/route";
import { PATCH } from "@/app/api/execution-plans/[planId]/steps/[stepId]/route";
import { POST } from "@/app/api/execution-plans/[planId]/steps/[stepId]/complete/route";

const mockSession = (overrides?: Partial<{ user: { id: string; role: string }; operatorId: string }>) => {
  const session = {
    operatorId: "op1",
    user: { id: "user1", role: "admin" },
    isSuperadmin: false,
    actingAsOperator: null,
    ...overrides,
  };
  if (overrides?.user) session.user = { ...session.user, ...overrides.user };
  (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(session);
};

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/execution-plans/plan1/steps/step1";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── GET /api/execution-plans/[planId] ────────────────────────────────────────

describe("GET /api/execution-plans/[planId]", () => {
  const planParams = Promise.resolve({ planId: "plan1" });

  it("returns plan with ordered steps", async () => {
    mockSession();
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan1",
      sourceType: "situation",
      sourceId: "sit1",
      status: "pending",
      currentStepOrder: 1,
      approvedAt: null,
      completedAt: null,
      priorityScore: null,
      createdAt: new Date(),
      steps: [
        { id: "s1", sequenceOrder: 1, title: "Step 1", description: "First", executionMode: "action", status: "awaiting_approval", assignedUserId: null, outputResult: null, approvedAt: null, approvedById: null, executedAt: null, errorMessage: null, originalDescription: null, createdAt: new Date() },
        { id: "s2", sequenceOrder: 2, title: "Step 2", description: "Second", executionMode: "generate", status: "pending", assignedUserId: null, outputResult: null, approvedAt: null, approvedById: null, executedAt: null, errorMessage: null, originalDescription: null, createdAt: new Date() },
        { id: "s3", sequenceOrder: 3, title: "Step 3", description: "Third", executionMode: "human_task", status: "pending", assignedUserId: "user1", outputResult: null, approvedAt: null, approvedById: null, executedAt: null, errorMessage: null, originalDescription: null, createdAt: new Date() },
      ],
    });

    const res = await GET(makeRequest("GET"), { params: planParams });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe("plan1");
    expect(data.steps).toHaveLength(3);
    expect(data.steps[0].sequenceOrder).toBe(1);
    expect(data.steps[1].sequenceOrder).toBe(2);
    expect(data.steps[2].sequenceOrder).toBe(3);
    expect(data.sourceType).toBe("situation");
    expect(data.status).toBe("pending");
  });

  it("returns 404 for wrong operator", async () => {
    mockSession();
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), { params: planParams });
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), { params: planParams });
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/execution-plans/[planId]/steps/[stepId] ───────────────────────

describe("PATCH /api/execution-plans/[planId]/steps/[stepId]", () => {
  const stepParams = Promise.resolve({ planId: "plan1", stepId: "step1" });

  const setupPlanAndStep = () => {
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan1",
      operatorId: "op1",
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "step1", planId: "plan1", status: "awaiting_approval" }) // validation load
      .mockResolvedValueOnce({ id: "step1", planId: "plan1", status: "approved" }); // re-fetch after advance
  };

  it("approve calls advanceStep", async () => {
    mockSession();
    setupPlanAndStep();
    (advanceStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }), { params: stepParams });

    expect(res.status).toBe(200);
    expect(advanceStep).toHaveBeenCalledWith("step1", "approve", "user1");
  });

  it("reject calls advanceStep", async () => {
    mockSession();
    setupPlanAndStep();
    (advanceStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await PATCH(makeRequest("PATCH", { action: "reject" }), { params: stepParams });

    expect(res.status).toBe(200);
    expect(advanceStep).toHaveBeenCalledWith("step1", "reject", "user1");
  });

  it("skip calls advanceStep", async () => {
    mockSession();
    setupPlanAndStep();
    (advanceStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await PATCH(makeRequest("PATCH", { action: "skip" }), { params: stepParams });

    expect(res.status).toBe(200);
    expect(advanceStep).toHaveBeenCalledWith("step1", "skip", "user1");
  });

  it("returns 400 for invalid action", async () => {
    mockSession();
    setupPlanAndStep();

    const res = await PATCH(makeRequest("PATCH", { action: "garbage" }), { params: stepParams });

    expect(res.status).toBe(400);
    expect(advanceStep).not.toHaveBeenCalled();
  });

  it("returns 403 for member role", async () => {
    mockSession({ user: { id: "user1", role: "member" } });

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }), { params: stepParams });

    expect(res.status).toBe(403);
  });

  it("returns 404 when step doesn't belong to plan", async () => {
    mockSession();
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan1",
      operatorId: "op1",
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1",
      planId: "other-plan",
    });

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }), { params: stepParams });

    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }), { params: stepParams });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/execution-plans/[planId]/steps/[stepId]/complete ───────────────

describe("POST /api/execution-plans/[planId]/steps/[stepId]/complete", () => {
  const completeParams = Promise.resolve({ planId: "plan1", stepId: "step1" });

  const setupForComplete = (stepOverrides?: Record<string, unknown>) => {
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan1",
      operatorId: "op1",
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: "step1",
        planId: "plan1",
        executionMode: "human_task",
        status: "executing",
        assignedUserId: "user1",
        ...stepOverrides,
      })
      .mockResolvedValueOnce({
        id: "step1",
        planId: "plan1",
        status: "completed",
        outputResult: JSON.stringify({ type: "human_completion", notes: "Done" }),
      });
  };

  it("completes human task", async () => {
    mockSession();
    setupForComplete();
    (completeHumanStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await POST(makeRequest("POST", { notes: "Done" }), { params: completeParams });

    expect(res.status).toBe(200);
    expect(completeHumanStep).toHaveBeenCalledWith("step1", "user1", "Done", undefined);
  });

  it("returns 403 when wrong user", async () => {
    mockSession();
    setupForComplete({ assignedUserId: "other-user" });

    const res = await POST(makeRequest("POST", { notes: "Done" }), { params: completeParams });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Only the assigned user can complete this task");
  });

  it("returns 400 when step is not human_task", async () => {
    mockSession();
    setupForComplete({ executionMode: "action" });

    const res = await POST(makeRequest("POST", { notes: "Done" }), { params: completeParams });

    expect(res.status).toBe(400);
  });

  it("returns 400 when step is not executing", async () => {
    mockSession();
    setupForComplete({ status: "completed" });

    const res = await POST(makeRequest("POST", { notes: "Done" }), { params: completeParams });

    expect(res.status).toBe(400);
  });

  it("returns 400 when notes empty", async () => {
    mockSession();
    setupForComplete();

    const res = await POST(makeRequest("POST", { notes: "" }), { params: completeParams });

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeRequest("POST", { notes: "Done" }), { params: completeParams });

    expect(res.status).toBe(401);
  });
});
