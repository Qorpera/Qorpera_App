import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockResolveMx = vi.fn();

vi.mock("dns", () => ({
  default: { resolveMx: (...args: any[]) => mockResolveMx(...args) },
  resolveMx: (...args: any[]) => mockResolveMx(...args),
}));

describe("detectEmailProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects Google Workspace from MX records", async () => {
    mockResolveMx.mockImplementation((_domain: string, cb: Function) => {
      cb(null, [
        { exchange: "aspmx.l.google.com", priority: 1 },
        { exchange: "alt1.aspmx.l.google.com", priority: 5 },
        { exchange: "alt2.aspmx.l.google.com", priority: 5 },
      ]);
    });

    const { detectEmailProvider } = await import("@/lib/connectors/mx-detection");
    const result = await detectEmailProvider("boltly.dk");

    expect(result.provider).toBe("google");
    expect(result.mxRecords.length).toBe(3);
    expect(result.mxRecords[0]).toContain("google");
  });

  it("detects Microsoft 365 from MX records", async () => {
    mockResolveMx.mockImplementation((_domain: string, cb: Function) => {
      cb(null, [
        { exchange: "boltly-dk.mail.protection.outlook.com", priority: 0 },
      ]);
    });

    const { detectEmailProvider } = await import("@/lib/connectors/mx-detection");
    const result = await detectEmailProvider("boltly.dk");

    expect(result.provider).toBe("microsoft");
    expect(result.mxRecords[0]).toContain("outlook.com");
  });

  it("returns unknown for unrecognized MX records", async () => {
    mockResolveMx.mockImplementation((_domain: string, cb: Function) => {
      cb(null, [
        { exchange: "mx.protonmail.ch", priority: 10 },
      ]);
    });

    const { detectEmailProvider } = await import("@/lib/connectors/mx-detection");
    const result = await detectEmailProvider("private.com");

    expect(result.provider).toBe("unknown");
    expect(result.mxRecords.length).toBe(1);
  });

  it("returns unknown with empty records on DNS failure", async () => {
    mockResolveMx.mockImplementation((_domain: string, cb: Function) => {
      cb(new Error("queryMx ENOTFOUND"), null);
    });

    const { detectEmailProvider } = await import("@/lib/connectors/mx-detection");
    const result = await detectEmailProvider("nonexistent.invalid");

    expect(result.provider).toBe("unknown");
    expect(result.mxRecords).toEqual([]);
  });
});
