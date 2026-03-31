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
vi.mock("@/lib/json-helpers", () => ({
  extractJSONArray: vi.fn(),
}));
vi.mock("@/lib/ai-provider", () => ({
  getModel: () => "claude-haiku-4-5-20251001",
}));

import { prisma } from "@/lib/db";
import { classifyOperatorChunks, classifyNewChunks } from "@/lib/knowledge/chunk-classifier";
import { extractJSONArray } from "@/lib/json-helpers";

const mockPrisma = prisma as unknown as {
  entity: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  contentChunk: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  slackChannelMapping: {
    findMany: ReturnType<typeof vi.fn>;
  };
  relationship: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockExtractJSONArray = extractJSONArray as ReturnType<typeof vi.fn>;

function setupMocks() {
  mockPrisma.entity = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
  };
  mockPrisma.contentChunk = {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
  };
  mockPrisma.slackChannelMapping = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockPrisma.relationship = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockExtractJSONArray.mockReturnValue(null);
}

const OP_ID = "op-1";

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe("classifyOperatorChunks", () => {
  it("classifies chunks via email metadata (algorithmic)", async () => {
    // Team members with emails mapped to departments
    mockPrisma.entity.findMany
      // First call: team members
      .mockResolvedValueOnce([
        {
          id: "person-1",
          parentDepartmentId: "dept-sales",
          propertyValues: [
            { value: "lars@boltly.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
        {
          id: "person-2",
          parentDepartmentId: "dept-eng",
          propertyValues: [
            { value: "mikkel@boltly.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
      ])
      // Second call: departments
      .mockResolvedValueOnce([
        { id: "dept-sales", displayName: "Sales", description: "Sales team" },
        { id: "dept-eng", displayName: "Engineering", description: "Eng team" },
      ]);

    // No department-member relationships
    mockPrisma.relationship.findMany.mockResolvedValue([]);

    // Already classified count
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    // Unclassified chunks with email metadata
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-1",
        entityId: null,
        sourceType: "email",
        metadata: '{"from":"lars@boltly.dk","to":"mikkel@boltly.dk"}',
        departmentIds: null,
        content: "Quarterly review notes",
      },
    ]);

    // Slack mappings
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);

    // Fallback updateMany
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 0 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.algorithmicCount).toBe(1);
    expect(mockPrisma.contentChunk.update).toHaveBeenCalledWith({
      where: { id: "chunk-1" },
      data: expect.objectContaining({
        classificationMethod: "algorithmic",
      }),
    });

    // Verify both departments were captured
    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toContain("dept-sales");
    expect(deptIds).toContain("dept-eng");
  });

  it("classifies chunks via entity chain resolution", async () => {
    // Team member with parentDepartmentId
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([
        {
          id: "person-1",
          parentDepartmentId: "dept-ops",
          propertyValues: [
            { value: "anna@boltly.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
      ])
      .mockResolvedValueOnce([
        { id: "dept-ops", displayName: "Operations", description: "" },
      ]);

    mockPrisma.relationship.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    // Chunk with entityId pointing to person-1
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-2",
        entityId: "person-1",
        sourceType: "drive_doc",
        metadata: null,
        departmentIds: null,
        content: "Operations manual",
      },
    ]);

    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 0 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.algorithmicCount).toBe(1);
    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toContain("dept-ops");
  });

  it("assigns multiple departments when emails span departments", async () => {
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([
        {
          id: "p1",
          parentDepartmentId: "dept-a",
          propertyValues: [
            { value: "alice@co.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
        {
          id: "p2",
          parentDepartmentId: "dept-b",
          propertyValues: [
            { value: "bob@co.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
      ])
      .mockResolvedValueOnce([
        { id: "dept-a", displayName: "A", description: "" },
        { id: "dept-b", displayName: "B", description: "" },
      ]);

    mockPrisma.relationship.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-3",
        entityId: null,
        sourceType: "email",
        metadata: '{"from":"alice@co.dk","cc":"bob@co.dk"}',
        departmentIds: null,
        content: "Cross-team sync",
      },
    ]);

    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 0 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.algorithmicCount).toBe(1);
    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toHaveLength(2);
    expect(deptIds).toContain("dept-a");
    expect(deptIds).toContain("dept-b");
  });

  it("skips already-classified chunks", async () => {
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.contentChunk.count.mockResolvedValue(5); // 5 already classified

    // findMany returns only unclassified (where classifiedAt: null)
    mockPrisma.contentChunk.findMany.mockResolvedValue([]);
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 0 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.alreadyClassified).toBe(5);
    expect(result.algorithmicCount).toBe(0);
    expect(result.totalChunks).toBe(0);
  });

  it("merges with existing departmentIds", async () => {
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([
        {
          id: "p1",
          parentDepartmentId: "dept-b",
          propertyValues: [
            { value: "carl@co.dk", property: { identityRole: "email", slug: "email" } },
          ],
        },
      ])
      .mockResolvedValueOnce([
        { id: "dept-a", displayName: "A", description: "" },
        { id: "dept-b", displayName: "B", description: "" },
      ]);

    mockPrisma.relationship.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    // Chunk already has dept-a from content-linkage, classifier finds dept-b via email
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-5",
        entityId: null,
        sourceType: "email",
        metadata: '{"from":"carl@co.dk"}',
        departmentIds: '["dept-a"]',
        content: "Hello",
      },
    ]);

    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 0 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.algorithmicCount).toBe(1);
    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toContain("dept-a");
    expect(deptIds).toContain("dept-b");
  });

  it("applies operator-wide fallback for remaining unclassified chunks", async () => {
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([]) // no team members
      .mockResolvedValueOnce([
        { id: "dept-x", displayName: "X", description: "" },
        { id: "dept-y", displayName: "Y", description: "" },
      ]);

    mockPrisma.contentChunk.count.mockResolvedValue(0);

    // One chunk that can't be classified algorithmically (no metadata, no entity)
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-6",
        entityId: null,
        sourceType: "uploaded_doc",
        metadata: null,
        departmentIds: null,
        content: "Some uploaded content",
      },
    ]);

    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);

    // No LLM results (no unresolved chunks go to Haiku since no members for context either)
    // The fallback updateMany catches it
    mockPrisma.contentChunk.updateMany.mockResolvedValue({ count: 1 });

    const result = await classifyOperatorChunks(OP_ID);

    expect(result.operatorWideCount).toBe(1);
    expect(mockPrisma.contentChunk.updateMany).toHaveBeenCalledWith({
      where: { operatorId: OP_ID, classifiedAt: null },
      data: expect.objectContaining({
        classificationMethod: "operator_wide",
      }),
    });

    // Verify all department IDs are in the fallback
    const updateManyCall = mockPrisma.contentChunk.updateMany.mock.calls[0][0];
    const deptIds = JSON.parse(updateManyCall.data.departmentIds);
    expect(deptIds).toContain("dept-x");
    expect(deptIds).toContain("dept-y");
  });
});

describe("classifyNewChunks", () => {
  it("merges with existing departmentIds from sync pipeline", async () => {
    // Chunk already has dept-a from resolveDepartmentsFromEmails
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-new-1",
        entityId: null,
        sourceType: "email",
        metadata: '{"from":"carl@co.dk"}',
        departmentIds: '["dept-a"]',
      },
    ]);

    mockPrisma.entity.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        parentDepartmentId: "dept-b",
        propertyValues: [
          { value: "carl@co.dk", property: { identityRole: "email", slug: "email" } },
        ],
      },
    ]);

    mockPrisma.relationship.findMany.mockResolvedValue([]);
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);

    const count = await classifyNewChunks(OP_ID, "email", "source-1");

    expect(count).toBe(1);
    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    const deptIds = JSON.parse(updateCall.data.departmentIds);
    expect(deptIds).toContain("dept-a");
    expect(deptIds).toContain("dept-b");
  });

  it("only processes chunks matching specified sourceType and sourceId", async () => {
    // findMany is called with the sourceType/sourceId filter
    mockPrisma.contentChunk.findMany.mockResolvedValue([]);
    mockPrisma.entity.findMany.mockResolvedValue([]);
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);

    await classifyNewChunks(OP_ID, "email", "msg-123");

    expect(mockPrisma.contentChunk.findMany).toHaveBeenCalledWith({
      where: {
        operatorId: OP_ID,
        sourceType: "email",
        sourceId: "msg-123",
        classifiedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it("sets classifiedAt and classificationMethod on resolved chunks", async () => {
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-new-2",
        entityId: "person-1",
        sourceType: "email",
        metadata: null,
        departmentIds: null,
      },
    ]);

    mockPrisma.entity.findMany.mockResolvedValueOnce([
      {
        id: "person-1",
        parentDepartmentId: "dept-x",
        propertyValues: [],
      },
    ]);

    mockPrisma.relationship.findMany.mockResolvedValue([]);
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([]);

    await classifyNewChunks(OP_ID, "email", "source-2");

    const updateCall = mockPrisma.contentChunk.update.mock.calls[0][0];
    expect(updateCall.data.classifiedAt).toBeInstanceOf(Date);
    expect(updateCall.data.classificationMethod).toBe("algorithmic");
  });
});
