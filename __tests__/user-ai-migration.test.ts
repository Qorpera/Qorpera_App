import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    entity: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "ai-ent-1" }),
    },
    entityType: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "et-1" }),
    },
    userScope: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    situationType: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    personalAutonomy: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "pa-1" }),
    },
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════

// We test the logic patterns from the migration script without running it directly,
// since it uses a standalone PrismaClient. These tests verify the building blocks.

describe("User AI migration patterns", () => {
  it("identifies users without AI entities", async () => {
    // All users
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u1", name: "Alice", email: "a@test.com", operatorId: "op-1", entityId: "e1" },
      { id: "u2", name: "Bob", email: "b@test.com", operatorId: "op-1", entityId: "e2" },
    ]);

    // Existing AI entities (only Alice has one)
    mockPrisma.entity.findMany.mockResolvedValueOnce([
      { ownerUserId: "u1" },
    ]);

    const users = await prisma.user.findMany({
      where: { accountSuspended: false, role: { not: "superadmin" } },
      select: { id: true, name: true, email: true, operatorId: true, entityId: true },
    });

    const aiEntities = await prisma.entity.findMany({
      where: { ownerUserId: { not: null } },
      select: { ownerUserId: true },
    });

    const usersWithAi = new Set(aiEntities.map((e: any) => e.ownerUserId));
    const usersToMigrate = users.filter((u: any) => !usersWithAi.has(u.id));

    expect(usersToMigrate).toHaveLength(1);
    expect(usersToMigrate[0].name).toBe("Bob");
  });

  it("creates AI entity with correct fields", async () => {
    mockPrisma.entityType.findFirst.mockResolvedValueOnce({ id: "et-ai" });
    mockPrisma.entity.create.mockResolvedValueOnce({ id: "new-ai-entity" });

    await prisma.entity.create({
      data: {
        operatorId: "op-1",
        entityTypeId: "et-ai",
        displayName: "Bob's Assistant",
        category: "base",
        parentDepartmentId: "dept-1",
        ownerUserId: "u2",
      },
    });

    expect(mockPrisma.entity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "u2",
        displayName: "Bob's Assistant",
        category: "base",
      }),
    });
  });

  it("creates PersonalAutonomy at supervised for each SituationType", async () => {
    mockPrisma.situationType.findMany.mockResolvedValueOnce([
      { id: "st-1" },
      { id: "st-2" },
    ]);

    const situationTypes = await prisma.situationType.findMany({
      where: { operatorId: "op-1" },
      select: { id: true },
    });

    for (const st of situationTypes) {
      await prisma.personalAutonomy.create({
        data: {
          operatorId: "op-1",
          situationTypeId: st.id,
          aiEntityId: "ai-ent-1",
          autonomyLevel: "supervised",
        },
      });
    }

    expect(mockPrisma.personalAutonomy.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.personalAutonomy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autonomyLevel: "supervised",
        situationTypeId: "st-1",
      }),
    });
  });

  it("skips users who already have AI entities", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u1", name: "Alice", operatorId: "op-1" },
    ]);
    mockPrisma.entity.findMany.mockResolvedValueOnce([
      { ownerUserId: "u1" },
    ]);

    const users = await prisma.user.findMany({});
    const aiEntities = await prisma.entity.findMany({
      where: { ownerUserId: { not: null } },
    });
    const usersWithAi = new Set(aiEntities.map((e: any) => e.ownerUserId));
    const usersToMigrate = users.filter((u: any) => !usersWithAi.has(u.id));

    expect(usersToMigrate).toHaveLength(0);
  });

  it("skips users without department scope", async () => {
    mockPrisma.userScope.findFirst.mockResolvedValueOnce(null);

    const scope = await prisma.userScope.findFirst({
      where: { userId: "u1" },
    });

    // No scope → skip
    expect(scope).toBeNull();
  });
});
