vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/project-access", () => ({
  assertProjectAccess: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/rag/pipeline", () => ({
  extractText: vi.fn(),
}));
vi.mock("@/lib/rag/embedding-queue", () => ({
  enqueueDocument: vi.fn(),
}));
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSessionUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/project-access";
import { checkRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/projects/[id]/upload/route";
import { NextRequest } from "next/server";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockAccess = assertProjectAccess as ReturnType<typeof vi.fn>;
const mockRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  internalDocument: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function makeRequest(file?: File) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new NextRequest("http://localhost/api/projects/proj1/upload", {
    method: "POST",
    body: formData,
  });
}

const paramsPromise = Promise.resolve({ id: "proj1" });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "u1", role: "admin" },
    operatorId: "op1",
    effectiveUserId: "u1",
    effectiveRole: "admin",
  });
  mockAccess.mockResolvedValue({ id: "proj1", operatorId: "op1", compilationStatus: null });
  mockRateLimit.mockReturnValue({ allowed: true, resetAt: 0 });
  mockPrisma.internalDocument = {
    create: vi.fn().mockResolvedValue({ id: "doc1" }),
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue({
      id: "doc1",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      documentType: "project_doc",
      embeddingStatus: "pending",
      status: "uploaded",
      projectId: "proj1",
      createdAt: new Date(),
    }),
  };
});

describe("POST /api/projects/[id]/upload", () => {
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

  it("rejects when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(429);
  });

  it("rejects when no file provided", async () => {
    const res = await POST(makeRequest(), { params: paramsPromise });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it("rejects unsupported file type", async () => {
    const file = new File(["data"], "virus.exe", { type: "application/x-msdownload" });
    const res = await POST(makeRequest(file), { params: paramsPromise });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported/i);
  });

  it("creates InternalDocument with projectId and no domainId", async () => {
    const file = new File(["hello world"], "test.txt", { type: "text/plain" });
    const res = await POST(makeRequest(file), { params: paramsPromise });
    expect(res.status).toBe(201);

    expect(mockPrisma.internalDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op1",
        projectId: "proj1",
        documentType: "project_doc",
      }),
    });

    // Verify no domainId or entityId set
    const createArg = mockPrisma.internalDocument.create.mock.calls[0][0];
    expect(createArg.data.domainId).toBeUndefined();
    expect(createArg.data.entityId).toBeUndefined();
  });

  it("rate limit key scoped to project not operator", async () => {
    const file = new File(["test"], "doc.txt", { type: "text/plain" });
    await POST(makeRequest(file), { params: paramsPromise });
    expect(mockRateLimit).toHaveBeenCalledWith("doc-upload:project:proj1", 20, 300000);
  });
});
