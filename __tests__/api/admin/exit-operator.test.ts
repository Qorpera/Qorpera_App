import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

const { mockCookieSet } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
    get: vi.fn(),
  }),
}));

import { getSessionUser } from "@/lib/auth";
import { POST } from "@/app/api/admin/exit-operator/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/exit-operator", () => {
  it("returns 403 for non-superadmin", async () => {
    mockAuth.mockResolvedValue({ user: { role: "admin" }, isSuperadmin: false });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("clears acting_operator_id cookie", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acting_operator_id", "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });

  it("also clears acting_user_id cookie to prevent stale impersonation", async () => {
    mockAuth.mockResolvedValue({ user: { role: "superadmin" }, isSuperadmin: true });
    await POST();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acting_user_id", "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
});
