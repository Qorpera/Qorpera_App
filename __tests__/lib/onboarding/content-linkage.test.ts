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
  it("links content chunks to domains via email metadata", async () => {
    // Team members with domains
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "ent-lars",
        primaryDomainId: "dept-ops",
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
      data: { domainIds: expect.stringContaining("dept-ops") },
    });
  });

  it("links activity signals to entities via email metadata", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "ent-lars",
        primaryDomainId: "dept-ops",
        propertyValues: [{ value: "lars@boltly.dk", property: { identityRole: "email", slug: "email" } }],
      },
    ]);

    mockPrisma.contentChunk.findMany.mockResolvedValue([]);

    mockPrisma.activitySignal.findMany.mockResolvedValue([
      {
        id: "sig-1",
        actorEntityId: null,
        domainIds: null,
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

  it("handles comma-separated CC email strings", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "ent-sofie",
        primaryDomainId: "dept-ops",
        propertyValues: [{ value: "sofie@boltly.dk", property: { identityRole: "email", slug: "email" } }],
      },
      {
        id: "ent-emil",
        primaryDomainId: "dept-ops",
        propertyValues: [{ value: "emil@boltly.dk", property: { identityRole: "email", slug: "email" } }],
      },
    ]);

    mockPrisma.contentChunk.findMany.mockResolvedValue([
      {
        id: "chunk-cc",
        metadata: JSON.stringify({ from: "lars@boltly.dk", to: "mikkel@boltly.dk", cc: "sofie@boltly.dk, emil@boltly.dk" }),
      },
    ]);
    mockPrisma.contentChunk.update.mockResolvedValue({});
    mockPrisma.activitySignal.findMany.mockResolvedValue([]);

    const result = await backfillContentLinkage("op-1");

    expect(result.chunksUpdated).toBe(1);
    expect(mockPrisma.contentChunk.update).toHaveBeenCalledWith({
      where: { id: "chunk-cc" },
      data: { domainIds: expect.stringContaining("dept-ops") },
    });
  });

  it("skips when no team members have domains", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([]);
    const result = await backfillContentLinkage("op-1");
    expect(result.chunksUpdated).toBe(0);
    expect(result.signalsUpdated).toBe(0);
  });
});
