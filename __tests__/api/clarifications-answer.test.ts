import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/wiki-engine", () => ({
  resolvePageSlug: vi.fn(),
}));

vi.mock("@/lib/situation-page-parser", () => ({
  parseSituationPage: vi.fn(),
}));

vi.mock("@/lib/clarification-helpers", () => ({
  parseOpenQuestionsSection: vi.fn(),
}));

vi.mock("@/lib/deliberation-pass", () => ({
  answerClarification: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolvePageSlug } from "@/lib/wiki-engine";
import { parseSituationPage } from "@/lib/situation-page-parser";
import { parseOpenQuestionsSection } from "@/lib/clarification-helpers";
import { answerClarification } from "@/lib/deliberation-pass";
import { POST } from "@/app/api/situations/[id]/clarifications/[questionId]/answer/route";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;
const mockResolve = resolvePageSlug as ReturnType<typeof vi.fn>;
const mockParsePage = parseSituationPage as ReturnType<typeof vi.fn>;
const mockParseQs = parseOpenQuestionsSection as ReturnType<typeof vi.fn>;
const mockAnswer = answerClarification as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeCtx(id: string, questionId: string) {
  return { params: Promise.resolve({ id, questionId }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/situations/[id]/clarifications/[questionId]/answer", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ choice: "A", isCustomAnswer: false }), makeCtx("sit-1", "q-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin and not situation assignee", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "member", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", content: "# Sit", properties: { assigned_to: "someone-else-slug" } },
    ]);
    mockParsePage.mockReturnValue({ sections: { openQuestions: "body" } });
    mockParseQs.mockReturnValue([{ id: "q-1", dimension: "tone", question: "?", options: [], raisedAt: "", affectedStepOrders: [], preferenceScope: { type: "person", scopeSlug: "x" } }]);
    mockResolve.mockResolvedValue("user-slug");

    const res = await POST(makeReq({ choice: "A", isCustomAnswer: false }), makeCtx("sit-1", "q-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when questionId not on page", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "admin", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", content: "# Sit", properties: {} },
    ]);
    mockParsePage.mockReturnValue({ sections: { openQuestions: "body" } });
    mockParseQs.mockReturnValue([{ id: "q-other", dimension: "tone", question: "?", options: [], raisedAt: "", affectedStepOrders: [], preferenceScope: { type: "person", scopeSlug: "x" } }]);

    const res = await POST(makeReq({ choice: "A", isCustomAnswer: false }), makeCtx("sit-1", "q-1"));
    expect(res.status).toBe(404);
  });

  it("calls answerClarification and returns 200 on admin happy path", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", role: "admin", email: "a@x.com", name: "A" },
      operatorId: "op-1",
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { slug: "sit-slug", content: "# Sit", properties: {} },
    ]);
    mockParsePage.mockReturnValue({ sections: { openQuestions: "body" } });
    mockParseQs.mockReturnValue([{ id: "q-1", dimension: "tone", question: "?", options: [], raisedAt: "", affectedStepOrders: [], preferenceScope: { type: "person", scopeSlug: "x" } }]);
    mockAnswer.mockResolvedValue(undefined);

    const res = await POST(makeReq({ choice: "Option A", isCustomAnswer: false }), makeCtx("sit-1", "q-1"));
    expect(res.status).toBe(200);
    expect(mockAnswer).toHaveBeenCalledWith("op-1", "sit-slug", "q-1", "Option A", false, "u-1");
    const body = await res.json();
    expect(body.choice).toBe("Option A");
    expect(body._wikiFirst).toBe(true);
  });
});
