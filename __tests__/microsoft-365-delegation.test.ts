import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getAppAccessToken", () => {
  const originalClientId = process.env.MICROSOFT_APP_CLIENT_ID;
  const originalClientSecret = process.env.MICROSOFT_APP_CLIENT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalClientId !== undefined) process.env.MICROSOFT_APP_CLIENT_ID = originalClientId;
    else delete process.env.MICROSOFT_APP_CLIENT_ID;
    if (originalClientSecret !== undefined) process.env.MICROSOFT_APP_CLIENT_SECRET = originalClientSecret;
    else delete process.env.MICROSOFT_APP_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("returns access token on success", async () => {
    process.env.MICROSOFT_APP_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_APP_CLIENT_SECRET = "test-secret";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "app-token-123", expires_in: 3600 }),
    }));

    const { getAppAccessToken } = await import("@/lib/connectors/microsoft-365-delegation");
    const token = await getAppAccessToken("tenant-uuid-123");

    expect(token).toBe("app-token-123");
    expect(fetch).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/tenant-uuid-123/oauth2/v2.0/token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when env vars are missing", async () => {
    delete process.env.MICROSOFT_APP_CLIENT_ID;
    delete process.env.MICROSOFT_APP_CLIENT_SECRET;

    const { getAppAccessToken } = await import("@/lib/connectors/microsoft-365-delegation");
    await expect(getAppAccessToken("tenant-uuid")).rejects.toThrow("not configured");
  });

  it("throws on non-ok response", async () => {
    process.env.MICROSOFT_APP_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_APP_CLIENT_SECRET = "test-secret";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid_grant"),
    }));

    const { getAppAccessToken } = await import("@/lib/connectors/microsoft-365-delegation");
    await expect(getAppAccessToken("bad-tenant")).rejects.toThrow("400");
  });
});

describe("listTenantUsers pagination", () => {
  const originalClientId = process.env.MICROSOFT_APP_CLIENT_ID;
  const originalClientSecret = process.env.MICROSOFT_APP_CLIENT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MICROSOFT_APP_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_APP_CLIENT_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalClientId !== undefined) process.env.MICROSOFT_APP_CLIENT_ID = originalClientId;
    else delete process.env.MICROSOFT_APP_CLIENT_ID;
    if (originalClientSecret !== undefined) process.env.MICROSOFT_APP_CLIENT_SECRET = originalClientSecret;
    else delete process.env.MICROSOFT_APP_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("follows @odata.nextLink for pagination", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      // Token endpoint
      if (url.includes("oauth2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: "token", expires_in: 3600 }),
        });
      }
      // Admin roles check
      if (url.includes("directoryRoles")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [] }),
        });
      }
      // Users endpoint — page 1
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            value: [{ mail: "a@co.com", displayName: "Alice", userPrincipalName: "a@co.com" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=page2",
          }),
        });
      }
      // Users endpoint — page 2
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          value: [{ mail: "b@co.com", displayName: "Bob", userPrincipalName: "b@co.com" }],
        }),
      });
    }));

    const { listTenantUsers } = await import("@/lib/connectors/microsoft-365-delegation");
    const users = await listTenantUsers("tenant-id");

    expect(users.length).toBe(2);
    expect(users[0].email).toBe("a@co.com");
    expect(users[1].email).toBe("b@co.com");
  });
});

describe("testMicrosoftAppAccess error classification", () => {
  const originalClientId = process.env.MICROSOFT_APP_CLIENT_ID;
  const originalClientSecret = process.env.MICROSOFT_APP_CLIENT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MICROSOFT_APP_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_APP_CLIENT_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalClientId !== undefined) process.env.MICROSOFT_APP_CLIENT_ID = originalClientId;
    else delete process.env.MICROSOFT_APP_CLIENT_ID;
    if (originalClientSecret !== undefined) process.env.MICROSOFT_APP_CLIENT_SECRET = originalClientSecret;
    else delete process.env.MICROSOFT_APP_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("returns unauthorized message on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: "token", expires_in: 3600 }),
        });
      }
      return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve("unauthorized") });
    }));

    const { testMicrosoftAppAccess } = await import("@/lib/connectors/microsoft-365-delegation");
    const result = await testMicrosoftAppAccess("tenant-id");

    expect(result.success).toBe(false);
    expect(result.error).toContain("App registration not authorized");
  });

  it("returns permissions message on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: "token", expires_in: 3600 }),
        });
      }
      return Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve("Authorization_RequestDenied") });
    }));

    const { testMicrosoftAppAccess } = await import("@/lib/connectors/microsoft-365-delegation");
    const result = await testMicrosoftAppAccess("tenant-id");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Insufficient permissions");
  });

  it("returns app-not-found message on AADSTS700016", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth2")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve("AADSTS700016: Application with identifier was not found in the directory"),
        });
      }
      return Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve("bad") });
    }));

    const { testMicrosoftAppAccess } = await import("@/lib/connectors/microsoft-365-delegation");
    const result = await testMicrosoftAppAccess("tenant-id");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Application not found");
  });

  it("returns success with user count on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth2")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: "token", expires_in: 3600 }),
        });
      }
      if (url.includes("directoryRoles")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { mail: "a@co.com", displayName: "Alice", userPrincipalName: "a@co.com" },
            { mail: "b@co.com", displayName: "Bob", userPrincipalName: "b@co.com" },
          ],
        }),
      });
    }));

    const { testMicrosoftAppAccess } = await import("@/lib/connectors/microsoft-365-delegation");
    const result = await testMicrosoftAppAccess("tenant-id");

    expect(result.success).toBe(true);
    expect(result.userCount).toBe(2);
  });
});

describe("getValidAccessToken routing", () => {
  const originalClientId = process.env.MICROSOFT_APP_CLIENT_ID;
  const originalClientSecret = process.env.MICROSOFT_APP_CLIENT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MICROSOFT_APP_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_APP_CLIENT_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalClientId !== undefined) process.env.MICROSOFT_APP_CLIENT_ID = originalClientId;
    else delete process.env.MICROSOFT_APP_CLIENT_ID;
    if (originalClientSecret !== undefined) process.env.MICROSOFT_APP_CLIENT_SECRET = originalClientSecret;
    else delete process.env.MICROSOFT_APP_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("routes to client credentials when delegation_type is app-permissions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "app-level-token", expires_in: 3600 }),
    }));

    const { getValidAccessToken } = await import("@/lib/connectors/microsoft-auth");
    const token = await getValidAccessToken({
      delegation_type: "app-permissions",
      tenant_id: "test-tenant-id",
      target_user_email: "user@company.com",
    });

    expect(token).toBe("app-level-token");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("test-tenant-id"),
      expect.anything()
    );
  });

  it("uses OAuth refresh path when no delegation_type", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { getValidAccessToken } = await import("@/lib/connectors/microsoft-auth");
    const token = await getValidAccessToken({
      access_token: "oauth-token-456",
      token_expiry: futureExpiry,
      refresh_token: "refresh-xyz",
    });

    expect(token).toBe("oauth-token-456");
  });
});

describe("getUserEndpointPrefix", () => {
  it("returns /users/{email} for delegation config", async () => {
    const { getUserEndpointPrefix } = await import("@/lib/connectors/microsoft-provider");
    const prefix = getUserEndpointPrefix({
      delegation_type: "app-permissions",
      target_user_email: "user@company.com",
    });

    expect(prefix).toBe("/users/user%40company.com");
  });

  it("returns /me for standard OAuth config", async () => {
    const { getUserEndpointPrefix } = await import("@/lib/connectors/microsoft-provider");
    const prefix = getUserEndpointPrefix({
      access_token: "token",
      token_expiry: new Date().toISOString(),
    });

    expect(prefix).toBe("/me");
  });
});
