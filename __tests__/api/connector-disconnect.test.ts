import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Prisma mock -----------------------------------------------------------

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: "user1", role: "admin" },
    operatorId: "op1",
    isSuperadmin: false,
    actingAsOperator: null,
  }),
}));

vi.mock("@/lib/connectors/registry", () => ({ getProvider: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

import { DELETE } from "@/app/api/connectors/[id]/route";
import { NextRequest } from "next/server";

function makeReq() {
  return new NextRequest("http://localhost/api/connectors/conn1", { method: "DELETE" });
}

function makeParams(id = "conn1") {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/connectors/[id] soft-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({ id: "conn1", operatorId: "op1", userId: null, provider: "google", deletedAt: null });
    mockUpdate.mockResolvedValue({ id: "conn1" });
  });

  it("soft-deletes by setting deletedAt instead of hard-deleting", async () => {
    const res = await DELETE(makeReq(), makeParams());
    expect(res.status).toBe(200);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn1" },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: "user1",
          healthStatus: "disconnected",
        }),
      }),
    );
  });

  it("preserves all related data (no deleteMany calls)", async () => {
    await DELETE(makeReq(), makeParams());

    // Only sourceConnector.update should be called — no hard deletes
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for already-deleted connectors (ACTIVE_CONNECTOR filter)", async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await DELETE(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it("filters queries with deletedAt: null", async () => {
    await DELETE(makeReq(), makeParams());

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});
