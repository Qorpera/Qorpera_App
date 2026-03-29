import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSourceConnectorFindMany = vi.fn();
const mockEntityFindMany = vi.fn();
const mockUserFindMany = vi.fn();
const mockOperatorFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: { findMany: (...a: unknown[]) => mockSourceConnectorFindMany(...a) },
    entity: { findMany: (...a: unknown[]) => mockEntityFindMany(...a) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
    operator: { findUnique: (...a: unknown[]) => mockOperatorFindUnique(...a) },
    activitySignal: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/config-encryption", () => ({
  decryptConfig: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockGoogleMeta(users: Array<Record<string, unknown>>) {
  return {
    provider: "google-delegation-meta",
    config: "encrypted-google",
  };
}

function mockMicrosoftMeta(users: Array<Record<string, unknown>>) {
  return {
    provider: "microsoft-delegation-meta",
    config: "encrypted-microsoft",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildPeopleRegistry — directory pre-population", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no users, no entities, no emails
    mockUserFindMany.mockResolvedValue([{ email: "admin@boltly.dk" }]);
    mockOperatorFindUnique.mockResolvedValue({ email: "info@boltly.dk" });
    mockEntityFindMany.mockResolvedValue([]);
  });

  it("pre-populates from Google meta with adminApiVerified", async () => {
    const googleUsers = [
      { email: "alice@boltly.dk", fullName: "Alice Jensen", department: "Engineering", title: "Developer", orgUnitPath: "/Engineering", isAdmin: false },
      { email: "bob@boltly.dk", fullName: "Bob Hansen", department: "Sales", title: "Manager", orgUnitPath: "/Sales", isAdmin: true },
    ];

    mockSourceConnectorFindMany.mockImplementation((args: any) => {
      if (args?.where?.provider?.in) {
        return Promise.resolve([mockGoogleMeta(googleUsers)]);
      }
      return Promise.resolve([]);
    });

    const { decryptConfig } = await import("@/lib/config-encryption");
    (decryptConfig as ReturnType<typeof vi.fn>).mockReturnValue({ users: googleUsers });

    const { buildPeopleRegistry } = await import("@/lib/onboarding-intelligence/agents/people-discovery");
    const registry = await buildPeopleRegistry("op1");

    const alice = registry.find(p => p.email === "alice@boltly.dk");
    expect(alice).toBeDefined();
    expect(alice!.adminApiVerified).toBe(true);
    expect(alice!.adminDepartment).toBe("Engineering");
    expect(alice!.adminTitle).toBe("Developer");
    expect(alice!.adminOrgUnit).toBe("/Engineering");
    expect(alice!.isInternal).toBe(true);

    const bob = registry.find(p => p.email === "bob@boltly.dk");
    expect(bob!.adminIsAdmin).toBe(true);
  });

  it("merges both directories — same email gets combined data", async () => {
    const googleUsers = [
      { email: "alice@boltly.dk", fullName: "Alice Jensen", department: "Engineering", title: "", orgUnitPath: "/Eng", isAdmin: false },
    ];
    const msUsers = [
      { email: "alice@boltly.dk", fullName: "Alice J", department: "", title: "Senior Dev", isAdmin: true },
    ];

    mockSourceConnectorFindMany.mockImplementation((args: any) => {
      if (args?.where?.provider?.in) {
        return Promise.resolve([mockGoogleMeta(googleUsers), mockMicrosoftMeta(msUsers)]);
      }
      return Promise.resolve([]);
    });

    const { decryptConfig } = await import("@/lib/config-encryption");
    (decryptConfig as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ users: googleUsers })
      .mockReturnValueOnce({ users: msUsers });

    const { buildPeopleRegistry } = await import("@/lib/onboarding-intelligence/agents/people-discovery");
    const registry = await buildPeopleRegistry("op1");

    const alice = registry.find(p => p.email === "alice@boltly.dk");
    expect(alice).toBeDefined();
    // Google filled department first, Microsoft shouldn't overwrite
    expect(alice!.adminDepartment).toBe("Engineering");
    // Google had empty title, Microsoft fills it
    expect(alice!.adminTitle).toBe("Senior Dev");
    // Google had orgUnit, Microsoft doesn't overwrite
    expect(alice!.adminOrgUnit).toBe("/Eng");
    // Admin in Microsoft → adminIsAdmin true
    expect(alice!.adminIsAdmin).toBe(true);
    // Should have both sources
    expect(alice!.sources.length).toBe(2);
  });

  it("handles empty user list gracefully", async () => {
    mockSourceConnectorFindMany.mockImplementation((args: any) => {
      if (args?.where?.provider?.in) {
        return Promise.resolve([{ provider: "google-delegation-meta", config: "enc" }]);
      }
      return Promise.resolve([]);
    });

    const { decryptConfig } = await import("@/lib/config-encryption");
    (decryptConfig as ReturnType<typeof vi.fn>).mockReturnValue({ users: [] });

    const { buildPeopleRegistry } = await import("@/lib/onboarding-intelligence/agents/people-discovery");
    const registry = await buildPeopleRegistry("op1");

    // Should still return an empty registry without errors
    expect(registry).toEqual([]);
  });

  it("continues gracefully when decryption fails", async () => {
    mockSourceConnectorFindMany.mockImplementation((args: any) => {
      if (args?.where?.provider?.in) {
        return Promise.resolve([{ provider: "google-delegation-meta", config: "bad-encrypted" }]);
      }
      return Promise.resolve([]);
    });

    const { decryptConfig } = await import("@/lib/config-encryption");
    (decryptConfig as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error("decrypt fail"); });

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { buildPeopleRegistry } = await import("@/lib/onboarding-intelligence/agents/people-discovery");
    const registry = await buildPeopleRegistry("op1");

    // Should not throw, returns empty registry
    expect(registry).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe("buildRound1Preamble — directory-verified section", () => {
  it("includes Directory-Verified Employees when entries exist", async () => {
    const { buildRound1Preamble } = await import("@/lib/onboarding-intelligence/orchestration");

    const people = [
      {
        email: "alice@co.com",
        displayName: "Alice",
        sources: [{ system: "google-admin-sdk" }],
        isInternal: true,
        activityMetrics: { emailsSent: 5, emailsReceived: 10, slackMessages: 0, meetingsAttended: 2, documentsAuthored: 0 },
        adminApiVerified: true,
        adminDepartment: "Engineering",
        adminTitle: "Developer",
      },
    ];

    const preamble = buildRound1Preamble(people as any);
    expect(preamble).toContain("Directory-Verified Employees");
    expect(preamble).toContain("Google Workspace");
    expect(preamble).toContain("Alice");
    expect(preamble).toContain("dept: Engineering");
    expect(preamble).toContain("activity: 17");
  });

  it("shows combined source label when both directories present", async () => {
    const { buildRound1Preamble } = await import("@/lib/onboarding-intelligence/orchestration");

    const people = [
      {
        email: "alice@co.com",
        displayName: "Alice",
        sources: [{ system: "google-admin-sdk" }, { system: "microsoft-graph" }],
        isInternal: true,
        activityMetrics: { emailsSent: 0, emailsReceived: 0, slackMessages: 0, meetingsAttended: 0, documentsAuthored: 0 },
        adminApiVerified: true,
      },
    ];

    const preamble = buildRound1Preamble(people as any);
    expect(preamble).toContain("Google Workspace + Microsoft 365");
  });

  it("does not include directory section when no verified entries", async () => {
    const { buildRound1Preamble } = await import("@/lib/onboarding-intelligence/orchestration");

    const people = [
      {
        email: "alice@co.com",
        displayName: "Alice",
        sources: [{ system: "gmail" }],
        isInternal: true,
        activityMetrics: { emailsSent: 5, emailsReceived: 0, slackMessages: 0, meetingsAttended: 0, documentsAuthored: 0 },
      },
    ];

    const preamble = buildRound1Preamble(people as any);
    expect(preamble).not.toContain("Directory-Verified");
  });
});
