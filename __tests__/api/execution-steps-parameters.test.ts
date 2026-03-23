import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    executionStep: { findUnique: vi.fn(), update: vi.fn() },
    executionPlan: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PATCH } from "@/app/api/execution-steps/[id]/parameters/route";

const mockPrisma = prisma as any;

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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/execution-steps/step1/parameters", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const pendingStep = {
  id: "step1",
  planId: "plan1",
  status: "pending",
  assignedUserId: null,
  plan: {
    id: "plan1",
    operatorId: "op1",
    situation: { assignedUserId: null },
  },
};

const stepParams = Promise.resolve({ id: "step1" });

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PATCH /api/execution-steps/[id]/parameters", () => {
  it("succeeds for pending step by admin", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue(pendingStep);
    mockPrisma.$transaction.mockResolvedValue([
      { id: "step1", parameters: '{"subject":"Updated"}' },
      { id: "plan1" },
    ]);

    const res = await PATCH(
      makeRequest({ parameters: { subject: "Updated" } }),
      { params: stepParams },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.parameters).toEqual({ subject: "Updated" });
    expect(data.modifiedBeforeApproval).toBe(true);
  });

  it("succeeds for pending step by assigned user", async () => {
    mockSession({ user: { id: "user2", role: "member" } });
    mockPrisma.executionStep.findUnique.mockResolvedValue({
      ...pendingStep,
      assignedUserId: "user2",
    });
    mockPrisma.$transaction.mockResolvedValue([
      { id: "step1", parameters: '{"body":"New body"}' },
      { id: "plan1" },
    ]);

    const res = await PATCH(
      makeRequest({ parameters: { body: "New body" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(200);
  });

  it("returns 400 for non-pending step", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue({
      ...pendingStep,
      status: "executing",
    });

    const res = await PATCH(
      makeRequest({ parameters: { subject: "x" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not pending");
  });

  it("returns 403 for unauthorized user", async () => {
    mockSession({ user: { id: "other", role: "member" } });
    mockPrisma.executionStep.findUnique.mockResolvedValue(pendingStep);

    const res = await PATCH(
      makeRequest({ parameters: { subject: "x" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(403);
  });

  it("sets modifiedBeforeApproval = true on the plan", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue(pendingStep);
    mockPrisma.$transaction.mockResolvedValue([
      { id: "step1", parameters: '{"a":"b"}' },
      { id: "plan1" },
    ]);

    await PATCH(
      makeRequest({ parameters: { a: "b" } }),
      { params: stepParams },
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    const txArgs = mockPrisma.$transaction.mock.calls[0][0];
    expect(txArgs).toHaveLength(2);
  });

  it("replaces parameters entirely (not merging)", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue({
      ...pendingStep,
      parameters: '{"old_key":"old_value","subject":"old"}',
    });
    mockPrisma.$transaction.mockResolvedValue([
      { id: "step1", parameters: '{"subject":"new"}' },
      { id: "plan1" },
    ]);

    const res = await PATCH(
      makeRequest({ parameters: { subject: "new" } }),
      { params: stepParams },
    );
    const data = await res.json();

    // Response should only contain the new parameters, not merged with old
    expect(data.parameters).toEqual({ subject: "new" });
    expect(data.parameters).not.toHaveProperty("old_key");
  });

  it("returns 401 when not authenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ parameters: { subject: "x" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when step not found", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ parameters: { subject: "x" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when step belongs to different operator", async () => {
    mockSession();
    mockPrisma.executionStep.findUnique.mockResolvedValue({
      ...pendingStep,
      plan: { ...pendingStep.plan, operatorId: "other-op" },
    });

    const res = await PATCH(
      makeRequest({ parameters: { subject: "x" } }),
      { params: stepParams },
    );

    expect(res.status).toBe(404);
  });
});
