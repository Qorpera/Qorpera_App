import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: { findFirst: vi.fn() },
    slackChannelMapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    entity: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/config-encryption", () => ({
  decryptConfig: vi.fn().mockReturnValue({ bot_token: "xoxb-test" }),
}));

// Mock fetch for Slack API
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ok: true, channels: [{ id: "C001", name: "general", is_private: false }], response_metadata: {} }),
  });
});

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { GET, POST, DELETE } from "@/app/api/connectors/[id]/channel-mappings/route";

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

const slackConnector = {
  id: "conn1",
  operatorId: "op1",
  provider: "slack",
  config: '{"bot_token":"xoxb-test"}',
  deletedAt: null,
};

const connParams = Promise.resolve({ id: "conn1" });

function makeReq(method: string, body?: unknown): NextRequest {
  const init: any = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest("http://localhost:3000/api/connectors/conn1/channel-mappings", init);
}

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ok: true, channels: [{ id: "C001", name: "general", is_private: false }], response_metadata: {} }),
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/connectors/[id]/channel-mappings", () => {
  it("returns channel mappings for a Slack connector", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.slackChannelMapping.findMany.mockResolvedValue([
      { id: "m1", channelId: "C001", channelName: "general", departmentId: "dept1", department: { id: "dept1", displayName: "Sales" } },
    ]);

    const res = await GET(makeReq("GET"), { params: connParams });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mappings).toHaveLength(1);
    expect(data.mappings[0].channelName).toBe("general");
  });

  it("returns 403 for non-admin", async () => {
    mockSession({ user: { id: "user2", role: "member" } });

    const res = await GET(makeReq("GET"), { params: connParams });
    expect(res.status).toBe(403);
  });

  it("validates connector is Slack type", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue({
      ...slackConnector,
      provider: "google",
    });

    const res = await GET(makeReq("GET"), { params: connParams });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/connectors/[id]/channel-mappings", () => {
  it("creates new mapping", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "dept1" });
    mockPrisma.slackChannelMapping.upsert.mockResolvedValue({
      id: "m1",
      channelId: "C001",
      channelName: "general",
      departmentId: "dept1",
      department: { id: "dept1", displayName: "Sales" },
    });

    const res = await POST(
      makeReq("POST", { channelId: "C001", channelName: "general", departmentId: "dept1" }),
      { params: connParams },
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.channelName).toBe("general");
  });

  it("upserts for existing channel mapping", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "dept2" });
    mockPrisma.slackChannelMapping.upsert.mockResolvedValue({
      id: "m1",
      channelId: "C001",
      channelName: "general",
      departmentId: "dept2",
      department: { id: "dept2", displayName: "Engineering" },
    });

    const res = await POST(
      makeReq("POST", { channelId: "C001", channelName: "general", departmentId: "dept2" }),
      { params: connParams },
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.slackChannelMapping.upsert).toHaveBeenCalledOnce();
  });

  it("validates department belongs to same operator", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.entity.findFirst.mockResolvedValue(null); // Not found

    const res = await POST(
      makeReq("POST", { channelId: "C001", channelName: "general", departmentId: "bad-dept" }),
      { params: connParams },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Department not found");
  });
});

describe("DELETE /api/connectors/[id]/channel-mappings", () => {
  it("removes mapping", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.slackChannelMapping.findUnique.mockResolvedValue({
      id: "m1",
      connectorId: "conn1",
      channelId: "C001",
      operatorId: "op1",
    });
    mockPrisma.slackChannelMapping.delete.mockResolvedValue({});

    const res = await DELETE(
      makeReq("DELETE", { channelId: "C001" }),
      { params: connParams },
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.slackChannelMapping.delete).toHaveBeenCalledOnce();
  });

  it("returns 404 for non-existent mapping", async () => {
    mockSession();
    mockPrisma.sourceConnector.findFirst.mockResolvedValue(slackConnector);
    mockPrisma.slackChannelMapping.findUnique.mockResolvedValue(null);

    const res = await DELETE(
      makeReq("DELETE", { channelId: "C999" }),
      { params: connParams },
    );

    expect(res.status).toBe(404);
  });
});
