import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAuthorize = vi.fn();

vi.mock("google-auth-library", () => {
  return {
    JWT: class MockJWT {
      constructor() {}
      authorize = mockAuthorize;
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServiceAccountKey(overrides: Record<string, string> = {}) {
  const key = {
    client_email: "test@project.iam.gserviceaccount.com",
    private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
    project_id: "test-project",
    ...overrides,
  };
  return Buffer.from(JSON.stringify(key)).toString("base64");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getServiceAccountCredentials", () => {
  const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
  });

  it("returns parsed credentials from valid base64", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = makeServiceAccountKey();
    const { getServiceAccountCredentials } = await import("@/lib/connectors/google-workspace-delegation");
    const creds = getServiceAccountCredentials();
    expect(creds).not.toBeNull();
    expect(creds!.client_email).toBe("test@project.iam.gserviceaccount.com");
    expect(creds!.project_id).toBe("test-project");
  });

  it("returns null when env var is not set", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const { getServiceAccountCredentials } = await import("@/lib/connectors/google-workspace-delegation");
    const creds = getServiceAccountCredentials();
    expect(creds).toBeNull();
  });

  it("returns null for invalid base64", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "not-valid-json-base64!!!";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getServiceAccountCredentials } = await import("@/lib/connectors/google-workspace-delegation");
    const creds = getServiceAccountCredentials();
    expect(creds).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe("getValidAccessToken routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = makeServiceAccountKey();
  });

  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  });

  it("routes to impersonation when delegation_type is domain-wide", async () => {
    mockAuthorize.mockResolvedValue({ access_token: "impersonated-token-123" });

    const { getValidAccessToken } = await import("@/lib/connectors/google-auth");

    const token = await getValidAccessToken({
      delegation_type: "domain-wide",
      impersonated_email: "user@company.com",
    });

    expect(token).toBe("impersonated-token-123");
    expect(mockAuthorize).toHaveBeenCalled();
  });

  it("uses OAuth path when delegation_type is not set", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { getValidAccessToken } = await import("@/lib/connectors/google-auth");

    const token = await getValidAccessToken({
      access_token: "oauth-token-456",
      token_expiry: futureExpiry,
      refresh_token: "refresh-xyz",
    });

    expect(token).toBe("oauth-token-456");
    expect(mockAuthorize).not.toHaveBeenCalled();
  });
});

describe("testDelegationAccess error classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = makeServiceAccountKey();
  });

  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  });

  it("returns propagation message on 401", async () => {
    mockAuthorize.mockResolvedValue({ access_token: "token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    }));

    const { testDelegationAccess } = await import("@/lib/connectors/google-workspace-delegation");
    const result = await testDelegationAccess("company.com", "admin@company.com");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Delegation not yet active");

    vi.unstubAllGlobals();
  });

  it("returns access denied message on 403", async () => {
    mockAuthorize.mockResolvedValue({ access_token: "token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("forbidden"),
    }));

    const { testDelegationAccess } = await import("@/lib/connectors/google-workspace-delegation");
    const result = await testDelegationAccess("company.com", "admin@company.com");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Access denied");

    vi.unstubAllGlobals();
  });

  it("returns invalid domain message on 400", async () => {
    mockAuthorize.mockResolvedValue({ access_token: "token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("bad request"),
    }));

    const { testDelegationAccess } = await import("@/lib/connectors/google-workspace-delegation");
    const result = await testDelegationAccess("bad-domain", "admin@bad-domain");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid domain");

    vi.unstubAllGlobals();
  });

  it("returns success with user count on 200", async () => {
    mockAuthorize.mockResolvedValue({ access_token: "token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        users: [
          { primaryEmail: "a@co.com", name: { fullName: "Alice" }, orgUnitPath: "/", isAdmin: false, suspended: false },
          { primaryEmail: "b@co.com", name: { fullName: "Bob" }, orgUnitPath: "/", isAdmin: true, suspended: false },
        ],
      }),
    }));

    const { testDelegationAccess } = await import("@/lib/connectors/google-workspace-delegation");
    const result = await testDelegationAccess("co.com", "admin@co.com");

    expect(result.success).toBe(true);
    expect(result.userCount).toBe(2);

    vi.unstubAllGlobals();
  });
});
