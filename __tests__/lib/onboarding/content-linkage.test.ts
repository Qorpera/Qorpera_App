import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: { findMany: vi.fn() },
    contentChunk: { findMany: vi.fn(), update: vi.fn() },
    activitySignal: { findMany: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { backfillContentLinkage } from "@/lib/onboarding-intelligence/content-linkage";

const mockPrisma = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe("backfillContentLinkage", () => {
  it("links content chunks to departments via email metadata", async () => {
    // Team members with departments
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "ent-lars",
        parentDepartmentId: "dept-ops",
        propertyValues: [{ value: "lars@boltly.dk", property: { identityRole: "email", slug: "email" } }],
      },
    ]);

    // Unlinked content chunk with email metadata
    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-1",
        metadata: JSON.stringify({ from: "lars@boltly.dk", to: "peter@client.dk", subject: "Test" }),
      },
    ]);
    mockPrisma.contentChunk.update.mockResolvedValue({});

    // No unlinked signals
    mockPrisma.activitySignal.findMany.mockResolvedValue([]);

    const result = await backfillContentLinkage("op-1");

    expect(result.chunksUpdated).toBe(1);
    expect(mockPrisma.contentChunk.update).toHaveBeenCalledWith({
      where: { id: "chunk-1" },
      data: { departmentIds: expect.stringContaining("dept-ops") },
    });
  });

  it("links activity signals to entities via email metadata", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "ent-lars",
        parentDepartmentId: "dept-ops",
        propertyValues: [{ value: "lars@boltly.dk", property: { identityRole: "email", slug: "email" } }],
      },
    ]);

    mockPrisma.contentChunk.findMany.mockResolvedValue([]);

    mockPrisma.activitySignal.findMany.mockResolvedValue([
      {
        id: "sig-1",
        actorEntityId: null,
        departmentIds: null,
        metadata: JSON.stringify({ from: "lars@boltly.dk" }),
      },
    ]);
    mockPrisma.activitySignal.update.mockResolvedValue({});

    const result = await backfillContentLinkage("op-1");

    expect(result.signalsUpdated).toBe(1);
    expect(mockPrisma.activitySignal.update).toHaveBeenCalledWith({
      where: { id: "sig-1" },
      data: expect.objectContaining({ actorEntityId: "ent-lars" }),
    });
  });

  it("skips when no team members have departments", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([]);
    const result = await backfillContentLinkage("op-1");
    expect(result.chunksUpdated).toBe(0);
    expect(result.signalsUpdated).toBe(0);
  });
});
