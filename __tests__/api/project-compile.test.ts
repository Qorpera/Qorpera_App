vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/project-access", () => ({
  assertProjectAccess: vi.fn(),
}));
vi.mock("@/lib/worker-dispatch", () => ({
  enqueueWorkerJob: vi.fn().mockResolvedValue("job1"),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSessionUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { POST } from "@/app/api/projects/[id]/compile/route";
import { NextRequest } from "next/server";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockAccess = assertProjectAccess as ReturnType<typeof vi.fn>;
const mockEnqueue = enqueueWorkerJob as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  internalDocument: { count: ReturnType<typeof vi.fn> };
  projectMember: { findFirst: ReturnType<typeof vi.fn> };
  project: { update: ReturnType<typeof vi.fn> };
};

function makeRequest() {
  return new NextRequest("http://localhost/api/projects/proj1/compile", { method: "POST" });
}

const paramsPromise = Promise.resolve({ id: "proj1" });

const projectBase = {
  id: "proj1",
  operatorId: "op1",
  compilationStatus: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "u1", role: "admin" },
    operatorId: "op1",
    effectiveUserId: "u1",
    effectiveRole: "admin",
  });
  mockAccess.mockResolvedValue({ ...projectBase });
  mockPrisma.internalDocument = {
    count: vi.fn().mockResolvedValue(5),
  };
  mockPrisma.projectMember = {
    findFirst: vi.fn().mockResolvedValue({ role: "owner" }),
  };
  mockPrisma.project = {
    update: vi.fn().mockResolvedValue({}),
  };
});

describe("POST /api/projects/[id]/compile", () => {
  it("rejects without auth", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(401);
  });

  it("rejects when project not found", async () => {
    mockAccess.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no documents exist", async () => {
    mockPrisma.internalDocument.count.mockResolvedValue(0);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no documents/i);
  });

  it("returns 409 when compilation already in progress", async () => {
    mockAccess.mockResolvedValue({ ...projectBase, compilationStatus: "compiling" });
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already in progress/i);
  });

  it("returns 400 when documents still processing", async () => {
    // First count: total docs = 5, second count: pending docs = 2
    mockPrisma.internalDocument.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/still being processed/i);
  });

  it("returns 202 and enqueues job when ready", async () => {
    // First count: total docs = 5, second count: pending docs = 0
    mockPrisma.internalDocument.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("compiling");

    // Verify status was set
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: "proj1" },
      data: { compilationStatus: "compiling" },
    });

    // Verify job was enqueued
    expect(mockEnqueue).toHaveBeenCalledWith("compile_project", "op1", { projectId: "proj1" });
  });

  it("rejects member without owner/reviewer role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", role: "member" },
      operatorId: "op1",
      effectiveUserId: "u2",
      effectiveRole: "member",
    });
    mockPrisma.projectMember.findFirst.mockResolvedValue({ role: "analyst" });
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(403);
  });

  it("allows member with reviewer role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", role: "member" },
      operatorId: "op1",
      effectiveUserId: "u2",
      effectiveRole: "member",
    });
    mockPrisma.projectMember.findFirst.mockResolvedValue({ role: "reviewer" });
    mockPrisma.internalDocument.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(202);
  });
});
