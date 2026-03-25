import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the underlying processors
vi.mock("@/lib/follow-up-scheduler", () => ({
  processFollowUps: vi.fn(),
}));

import { processFollowUps } from "@/lib/follow-up-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
});

describe("/api/cron/follow-ups", () => {
  it("returns 401 without CRON_SECRET in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { GET } = await import("@/app/api/cron/follow-ups/route");
    const req = new Request("http://localhost/api/cron/follow-ups", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);

    vi.stubEnv("NODE_ENV", "test");
  });

  it("processes follow-ups with valid auth", async () => {
    (processFollowUps as ReturnType<typeof vi.fn>).mockResolvedValue({
      processed: 3, triggered: 1, reminders: 1, errors: 0,
    });

    const { GET } = await import("@/app/api/cron/follow-ups/route");
    const req = new Request("http://localhost/api/cron/follow-ups");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(3);
    expect(body.triggered).toBe(1);
  });
});

describe("/api/cron/recurring-tasks (migrated to worker)", () => {
  it("returns migrated stub response", async () => {
    const { GET } = await import("@/app/api/cron/recurring-tasks/route");
    const req = new Request("http://localhost/api/cron/recurring-tasks");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.migrated).toBe("worker");
  });
});

