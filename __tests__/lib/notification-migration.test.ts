/**
 * Tests for notification migration: all prisma.notification.create calls
 * should be routed through sendNotification() or sendNotificationToAdmins().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Scan source files for direct prisma.notification.create usage
function findDirectNotificationCreates(dir: string): Array<{ file: string; line: number; text: string }> {
  const results: Array<{ file: string; line: number; text: string }> = [];

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = readFileSync(full, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (line.includes("prisma.notification.create")) {
            results.push({ file: full, line: idx + 1, text: line.trim() });
          }
        });
      }
    }
  }

  walk(dir);
  return results;
}

describe("notification migration completeness", () => {
  const srcLib = join(__dirname, "../../src/lib");
  const srcApp = join(__dirname, "../../src/app");

  it("no direct prisma.notification.create calls remain in src/lib (except notification-dispatch.ts)", () => {
    const hits = findDirectNotificationCreates(srcLib);
    const violations = hits.filter(
      (h) => !h.file.includes("notification-dispatch.ts")
    );

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} direct prisma.notification.create call(s) that should use sendNotification():\n${details}`
      );
    }
  });

  it("no direct prisma.notification.create calls remain in src/app (except test seeder)", () => {
    const hits = findDirectNotificationCreates(srcApp);
    const violations = hits.filter(
      (h) => !h.file.includes("create-test-company")
    );

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} direct prisma.notification.create call(s) that should use sendNotification():\n${details}`
      );
    }
  });
});

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { create: vi.fn().mockResolvedValue({ id: "notif-1" }) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: "admin", email: "admin@test.com" }),
      findMany: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    },
    operator: { findUnique: vi.fn().mockResolvedValue({ displayName: "Test Co" }) },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/emails/template-registry", () => ({
  renderNotificationEmail: vi.fn().mockReturnValue(null),
}));

import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";

describe("sendNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an in-app notification with all fields including sourceAiEntityId", async () => {
    await sendNotification({
      operatorId: "op-1",
      userId: "user-1",
      type: "peer_signal",
      title: "Test signal",
      body: "Signal body",
      sourceType: "peer_signal",
      sourceAiEntityId: "ai-entity-1",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op-1",
        userId: "user-1",
        title: "Test signal",
        body: "Signal body",
        sourceType: "peer_signal",
        sourceAiEntityId: "ai-entity-1",
      }),
    });
  });

  it("creates notification with system_alert type for system notifications", async () => {
    await sendNotification({
      operatorId: "op-1",
      userId: "user-1",
      type: "system_alert",
      title: "Sync failed",
      body: "Connector sync failed 3 times",
      sourceType: "system",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Sync failed",
        sourceType: "system",
      }),
    });
  });

  it("creates notification with graduation_proposal type", async () => {
    await sendNotification({
      operatorId: "op-1",
      userId: "user-1",
      type: "graduation_proposal",
      title: "Promote to notify: Late Invoice",
      body: "5 consecutive approvals",
      sourceType: "graduation",
      sourceId: "st-1",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Promote to notify: Late Invoice",
        sourceType: "graduation",
        sourceId: "st-1",
      }),
    });
  });
});

describe("sendNotificationToAdmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends to all admin users for the operator", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "admin-1" },
      { id: "admin-2" },
    ]);

    await sendNotificationToAdmins({
      operatorId: "op-1",
      type: "situation_proposed",
      title: "New situation",
      body: "A situation was detected",
      sourceType: "situation",
      sourceId: "sit-1",
    });

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });
});
