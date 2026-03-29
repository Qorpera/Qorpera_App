import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn().mockResolvedValue({ id: "et1", properties: [{ slug: "email" }] }),
      create: vi.fn().mockResolvedValue({ id: "et1" }),
    },
    entityProperty: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    entity: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "ent1" }),
    },
    propertyValue: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    entityMention: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/event-materializer", () => ({
  ensureHardcodedEntityType: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  upsertEntity: vi.fn().mockResolvedValue("ent-id"),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: "u1", role: "admin", email: "admin@boltly.dk" },
    operatorId: "op1",
  }),
}));

vi.mock("@/lib/config-encryption", () => ({
  encryptConfig: vi.fn().mockReturnValue("encrypted-config"),
  decryptConfig: vi.fn().mockReturnValue({ tenantId: "12345678-1234-1234-1234-123456789012", clientSecret: "stored-secret" }),
}));

vi.mock("@/lib/connectors/google-workspace-delegation", () => ({
  listDomainUsers: vi.fn(),
}));

vi.mock("@/lib/connectors/microsoft-365-delegation", () => ({
  testMicrosoftAppAccess: vi.fn(),
  getMicrosoftAppClientId: vi.fn().mockReturnValue("ms-app-id"),
  REQUIRED_PERMISSIONS: ["Mail.Read", "Files.Read.All"],
}));

vi.mock("dns", () => ({
  default: {
    resolveMx: (_domain: string, cb: Function) => {
      cb(null, [{ exchange: "aspmx.l.google.com", priority: 1 }]);
    },
  },
  resolveMx: (_domain: string, cb: Function) => {
    cb(null, [{ exchange: "aspmx.l.google.com", priority: 1 }]);
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/connectors/detect-provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts domain from email and detects provider", async () => {
    const { POST } = await import("@/app/api/connectors/detect-provider/route");
    const req = new Request("http://localhost/api/connectors/detect-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "admin@boltly.dk" }),
    });

    const res = await POST(req as any);
    const data = await res.json();
    expect(data.provider).toBeDefined();
    // Provider will be "google" because our mock returns google MX
    expect(data.mxRecords).toBeDefined();
  });

  it("rejects invalid domain", async () => {
    const { POST } = await import("@/app/api/connectors/detect-provider/route");
    const req = new Request("http://localhost/api/connectors/detect-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "x" }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/connectors/google-workspace/delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates delegation meta connector on success", async () => {
    const { listDomainUsers } = await import("@/lib/connectors/google-workspace-delegation");
    (listDomainUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "a@boltly.dk", fullName: "Alice", department: "Engineering" },
      { email: "b@boltly.dk", fullName: "Bob", department: "Sales" },
    ]);

    const { prisma } = await import("@/lib/db");
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.sourceConnector.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sc1" });

    const { POST } = await import("@/app/api/connectors/google-workspace/delegation/route");
    const req = new Request("http://localhost/api/connectors/google-workspace/delegation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "boltly.dk", adminEmail: "admin@boltly.dk" }),
    });

    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.employeeCount).toBe(2);
    expect(prisma.sourceConnector.create).toHaveBeenCalled();
  });
});

describe("POST /api/connectors/microsoft-365/save-tenant-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates microsoft-delegation-meta connector", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.sourceConnector.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sc2" });

    const { POST } = await import("@/app/api/connectors/microsoft-365/save-tenant-config/route");
    const req = new Request("http://localhost/api/connectors/microsoft-365/save-tenant-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: "12345678-1234-1234-1234-123456789012",
        clientSecret: "a-long-secret-value-here",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(prisma.sourceConnector.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "microsoft-delegation-meta" }),
      })
    );
  });

  it("rejects invalid tenant ID", async () => {
    const { POST } = await import("@/app/api/connectors/microsoft-365/save-tenant-config/route");
    const req = new Request("http://localhost/api/connectors/microsoft-365/save-tenant-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: "not-a-uuid",
        clientSecret: "a-long-secret-value-here",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/connectors/microsoft-365/test-app-permissions (with meta fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads tenantId from meta connector when not provided", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sc2",
      config: "encrypted-config",
    });

    const { testMicrosoftAppAccess } = await import("@/lib/connectors/microsoft-365-delegation");
    (testMicrosoftAppAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      userCount: 15,
    });

    const { POST } = await import("@/app/api/connectors/microsoft-365/test-app-permissions/route");
    const req = new Request("http://localhost/api/connectors/microsoft-365/test-app-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.userCount).toBe(15);
  });
});
