import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), update: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/emails/template-registry", () => ({
  renderDigestEmail: vi
    .fn()
    .mockResolvedValue({ subject: "Digest", html: "<html/>" }),
}));

vi.mock("@/lib/digest-compiler", () => ({
  compileDigest: vi.fn(),
}));

import { GET } from "@/app/api/cron/send-digest/route";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { compileDigest } from "@/lib/digest-compiler";

const mockPrisma = prisma as any;
const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockCompileDigest = compileDigest as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/send-digest", () => {
  it("rejects requests without valid CRON_SECRET", async () => {
    const req = new Request("http://localhost/api/cron/send-digest");
    const res = await GET(req as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("sends digest to eligible users", async () => {
    const users = [
      { id: "u1", email: "a@test.com", name: "Alice", operatorId: "op1" },
      { id: "u2", email: "b@test.com", name: "Bob", operatorId: "op1" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(users);
    mockPrisma.user.update.mockResolvedValue({});
    mockCompileDigest.mockResolvedValue({
      notifications: [{ id: "n1", message: "Something happened" }],
      periodStart: new Date("2026-03-20"),
      periodEnd: new Date("2026-03-21"),
    });

    const req = new Request("http://localhost/api/cron/send-digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(2);
    expect(body.skipped).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
  });

  it("skips users with no notifications", async () => {
    const users = [
      { id: "u1", email: "a@test.com", name: "Alice", operatorId: "op1" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(users);
    mockCompileDigest.mockResolvedValue(null);

    const req = new Request("http://localhost/api/cron/send-digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("updates lastDigestSentAt after successful send", async () => {
    const users = [
      { id: "u1", email: "a@test.com", name: "Alice", operatorId: "op1" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(users);
    mockPrisma.user.update.mockResolvedValue({});
    mockCompileDigest.mockResolvedValue({
      notifications: [{ id: "n1", message: "test" }],
      periodStart: new Date("2026-03-20"),
      periodEnd: new Date("2026-03-21"),
    });

    const req = new Request("http://localhost/api/cron/send-digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    await GET(req as any);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { lastDigestSentAt: expect.any(Date) },
    });
  });
});
