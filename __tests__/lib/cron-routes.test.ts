import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the underlying processors
vi.mock("@/lib/follow-up-scheduler", () => ({
  processFollowUps: vi.fn(),
}));

vi.mock("@/lib/recurring-tasks", () => ({
  processRecurringTasks: vi.fn(),
}));

vi.mock("@/lib/initiative-reasoning", () => ({
  runScheduledInitiativeEvaluation: vi.fn(),
}));

import { processFollowUps } from "@/lib/follow-up-scheduler";
import { processRecurringTasks } from "@/lib/recurring-tasks";
import { runScheduledInitiativeEvaluation } from "@/lib/initiative-reasoning";

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

describe("/api/cron/recurring-tasks", () => {
  it("returns 401 without CRON_SECRET in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { GET } = await import("@/app/api/cron/recurring-tasks/route");
    const req = new Request("http://localhost/api/cron/recurring-tasks", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);

    vi.stubEnv("NODE_ENV", "test");
  });

  it("processes recurring tasks with valid auth", async () => {
    (processRecurringTasks as ReturnType<typeof vi.fn>).mockResolvedValue({
      processed: 2, triggered: 2, errors: 0,
    });

    const { GET } = await import("@/app/api/cron/recurring-tasks/route");
    const req = new Request("http://localhost/api/cron/recurring-tasks");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.triggered).toBe(2);
  });
});

describe("/api/cron/initiatives (migrated to worker)", () => {
  it("returns migrated stub response", async () => {
    const { GET } = await import("@/app/api/cron/initiatives/route");
    const req = new Request("http://localhost/api/cron/initiatives");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.migrated).toBe("worker");
  });
});
