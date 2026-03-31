import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockAnthropicCreate };
    },
  };
});

vi.mock("@/lib/ai-provider", () => ({
  getModel: () => "claude-haiku-4-5-20251001",
}));

vi.mock("@/lib/json-helpers", () => ({
  extractJSON: vi.fn(),
}));

vi.mock("@/lib/knowledge/chunk-classifier", () => ({
  buildDepartmentContext: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { extractJSON } from "@/lib/json-helpers";
import { buildDepartmentContext } from "@/lib/knowledge/chunk-classifier";
import { GET } from "@/app/api/cron/reevaluate-chunks/route";

const mockBuildDepartmentContext = buildDepartmentContext as ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  operator: {
    findMany: ReturnType<typeof vi.fn>;
  };
  contentChunk: {
    update: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const mockExtractJSON = extractJSON as ReturnType<typeof vi.fn>;

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new Request("http://localhost/api/cron/reevaluate-chunks", { headers }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");

  mockPrisma.operator = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockPrisma.contentChunk = {
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: '{"departmentIds": ["dept-a"]}' }],
  });
  mockExtractJSON.mockReturnValue(null);
  mockBuildDepartmentContext.mockResolvedValue({
    departments: [],
    contextString: "",
  });
});

describe("/api/cron/reevaluate-chunks", () => {
  it("returns 401 without CRON_SECRET", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("skips test operators", async () => {
    mockPrisma.operator.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.operators).toBe(0);
    expect(body.totalReevaluated).toBe(0);

    // Verify the operator query filters out test operators
    expect(mockPrisma.operator.findMany).toHaveBeenCalledWith({
      where: { aiPaused: false, isTestOperator: false },
      select: { id: true },
    });
  });

  it("sets reevaluatedAt after processing a chunk", async () => {
    mockPrisma.operator.findMany.mockResolvedValue([{ id: "op-1" }]);

    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: "chunk-1",
        content: "Test content",
        sourceType: "email",
        metadata: null,
        departmentIds: '["dept-a"]',
      },
    ]);

    mockBuildDepartmentContext.mockResolvedValue({
      departments: [{ id: "dept-a", displayName: "Sales", description: "Sales team" }],
      contextString: "- Sales (ID: dept-a): Sales team. Key members: none listed",
    });

    mockExtractJSON.mockReturnValue({ departmentIds: ["dept-a"] });

    const res = await GET(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalReevaluated).toBe(1);

    expect(mockPrisma.contentChunk.update).toHaveBeenCalledWith({
      where: { id: "chunk-1" },
      data: expect.objectContaining({
        reevaluatedAt: expect.any(Date),
      }),
    });
  });

  it("skips already-reevaluated chunks via SQL filter", async () => {
    mockPrisma.operator.findMany.mockResolvedValue([{ id: "op-1" }]);

    mockPrisma.$queryRaw.mockResolvedValue([]);

    const res = await GET(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalReevaluated).toBe(0);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("tracks changed count when departments differ", async () => {
    mockPrisma.operator.findMany.mockResolvedValue([{ id: "op-1" }]);

    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: "chunk-1",
        content: "Finance report",
        sourceType: "email",
        metadata: null,
        departmentIds: '["dept-a"]',
      },
    ]);

    mockBuildDepartmentContext.mockResolvedValue({
      departments: [
        { id: "dept-a", displayName: "Sales", description: "" },
        { id: "dept-b", displayName: "Finance", description: "" },
      ],
      contextString: "- Sales (ID: dept-a): . Key members: none\n- Finance (ID: dept-b): . Key members: none",
    });

    mockExtractJSON.mockReturnValue({ departmentIds: ["dept-b"] });

    const res = await GET(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalChanged).toBe(1);
    expect(body.totalReevaluated).toBe(1);

    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toEqual(["dept-b"]);
    expect(updateCall.data.classificationMethod).toBe("llm");
  });
});
