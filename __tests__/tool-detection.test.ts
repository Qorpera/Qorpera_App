import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryRaw = vi.fn();
const mockConnectorFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: (...a: unknown[]) => mockQueryRaw(...a),
    sourceConnector: {
      findMany: (...a: unknown[]) => mockConnectorFindMany(...a),
    },
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("detectToolsFromEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectorFindMany.mockResolvedValue([]);
  });

  it("detects HubSpot from sender domain", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "hubspot.com", cnt: BigInt(15), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-03-01") },
    ]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    const hubspot = tools.find(t => t.provider === "hubspot");
    expect(hubspot).toBeDefined();
    expect(hubspot!.emailCount).toBe(15);
    expect(hubspot!.label).toBe("HubSpot");
  });

  it("detects Slack from sender domain", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "slack.com", cnt: BigInt(50), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
    ]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    expect(tools.find(t => t.provider === "slack")).toBeDefined();
  });

  it("handles subdomain matching: mail.hubspot.com → hubspot.com", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "mail.hubspot.com", cnt: BigInt(10), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-03-01") },
    ]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    const hubspot = tools.find(t => t.provider === "hubspot");
    expect(hubspot).toBeDefined();
    expect(hubspot!.emailCount).toBe(10);
  });

  it("ignores tools with fewer than 2 emails", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "stripe.com", cnt: BigInt(1), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-01-01") },
    ]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    expect(tools.find(t => t.provider === "stripe")).toBeUndefined();
  });

  it("marks already-connected tools", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "hubspot.com", cnt: BigInt(20), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
    ]);
    mockConnectorFindMany.mockResolvedValue([{ provider: "hubspot" }]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    const hubspot = tools.find(t => t.provider === "hubspot");
    expect(hubspot!.alreadyConnected).toBe(true);
  });

  it("sorts unconnected first by email count, connected last", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: "hubspot.com", cnt: BigInt(10), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
      { domain: "slack.com", cnt: BigInt(50), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
      { domain: "stripe.com", cnt: BigInt(5), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
    ]);
    mockConnectorFindMany.mockResolvedValue([{ provider: "hubspot" }]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    // Slack (unconnected, 50) first, Stripe (unconnected, 5) second, HubSpot (connected, 10) last
    expect(tools[0].provider).toBe("slack");
    expect(tools[1].provider).toBe("stripe");
    expect(tools[2].provider).toBe("hubspot");
  });

  it("returns empty array when no email data exists", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    expect(tools).toEqual([]);
  });

  it("handles malformed sender metadata gracefully", async () => {
    mockQueryRaw.mockResolvedValue([
      { domain: null, cnt: BigInt(5), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
      { domain: "", cnt: BigInt(3), first_seen: new Date("2024-01-01"), last_seen: new Date("2024-06-01") },
    ]);

    const { detectToolsFromEmail } = await import("@/lib/connectors/tool-detection");
    const tools = await detectToolsFromEmail("op1");

    expect(tools).toEqual([]);
  });
});
