import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolvePageSlug } from "@/lib/wiki-engine";
import { overrideAutoAppliedDecision } from "@/lib/deliberation-pass";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decisionId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, decisionId } = await params;

  const body = await req.json().catch(() => ({}));
  const newChoice = typeof body.newChoice === "string" ? body.newChoice.trim() : "";
  if (!newChoice) {
    return NextResponse.json({ error: "newChoice must be a non-empty string" }, { status: 400 });
  }

  const pages = await prisma.$queryRawUnsafe<Array<{ slug: string; properties: SituationProperties | null }>>(
    `SELECT slug, properties FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (pages.length === 0) {
    return NextResponse.json({ error: "Situation not found" }, { status: 404 });
  }

  const page = pages[0];

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (!isAdmin) {
    const userSlug = await resolvePageSlug(operatorId, user.email ?? undefined, user.name ?? undefined);
    const isSituationAssignee =
      userSlug != null && page.properties?.assigned_to === userSlug;
    if (!isSituationAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await overrideAutoAppliedDecision(
    operatorId,
    page.slug,
    decisionId,
    newChoice,
    user.id,
  );

  if (!result.success) {
    const status = result.error === "decision_not_found_or_not_auto_applied" ? 404 : 500;
    return NextResponse.json({ error: result.error ?? "override_failed" }, { status });
  }

  return NextResponse.json({
    decisionId,
    newChoice,
    overriddenAt: new Date().toISOString(),
    _wikiFirst: true,
  });
}
