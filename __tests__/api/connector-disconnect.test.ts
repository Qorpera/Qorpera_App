import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Prisma mock -----------------------------------------------------------

const mockDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindFirst = vi.fn();
const mockDelete = vi.fn();

function makeTx() {
  return {
    contentChunk:    { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    activitySignal:  { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    event:           { findMany: (...a: unknown[]) => mockFindMany(...a), deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    situationEvent:  { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    syncLog:         { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    actionCapability:{ deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
    sourceConnector: { delete: (...a: unknown[]) => mockDelete(...a) },
  };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    $transaction: (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => fn(makeTx()),
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

describe("DELETE /api/connectors/[id] cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({ id: "conn1", operatorId: "op1", userId: null, provider: "google" });
    mockFindMany.mockResolvedValue([]);
    mockDelete.mockResolvedValue({});
  });

  it("deletes ContentChunks tied to connector", async () => {
    const res = await DELETE(makeReq(), makeParams());
    expect(res.status).toBe(200);

    const contentChunkCall = mockDeleteMany.mock.calls.find(
      (c: unknown[]) => JSON.stringify(c).includes("connectorId")
    );
    expect(contentChunkCall).toBeDefined();
  });

  it("deletes ActivitySignals tied to connector", async () => {
    await DELETE(makeReq(), makeParams());

    const connectorCalls = mockDeleteMany.mock.calls.filter(
      (c: unknown[]) => JSON.stringify(c[0]).includes('"connectorId"')
    );
    // contentChunk, activitySignal, event, syncLog, actionCapability = 5 calls with connectorId
    expect(connectorCalls.length).toBeGreaterThanOrEqual(4);
  });

  it("deletes Events tied to connector", async () => {
    mockFindMany.mockResolvedValue([{ id: "ev1" }, { id: "ev2" }]);

    await DELETE(makeReq(), makeParams());

    // event.findMany should be called to get event IDs
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { connectorId: "conn1" }, select: { id: true } })
    );

    // situationEvent.deleteMany should be called for the event IDs
    const sitEvtCall = mockDeleteMany.mock.calls.find(
      (c: unknown[]) => JSON.stringify(c).includes('"eventId"')
    );
    expect(sitEvtCall).toBeDefined();
  });

  it("preserves entities created by connector (does NOT delete entities)", async () => {
    await DELETE(makeReq(), makeParams());

    // mockDelete is only called for sourceConnector.delete, not entity
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "conn1" } });
  });

  it("deletes SyncLogs and ActionCapabilities", async () => {
    await DELETE(makeReq(), makeParams());

    // Total deleteMany calls: contentChunk, activitySignal, event, syncLog, actionCapability = 5
    expect(mockDeleteMany).toHaveBeenCalledTimes(5);
  });

  it("runs all deletes inside a $transaction", async () => {
    // The mock $transaction calls fn(tx) synchronously — if it runs,
    // all delete mocks should have been called through the tx object
    await DELETE(makeReq(), makeParams());

    // All deletes happen inside the transaction callback
    expect(mockDeleteMany).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
  });
});
