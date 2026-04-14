import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { getVisibleDomainSlugs, getVisibleDomainIds } from "@/lib/domain-scope";
import { updatePageWithLock } from "@/lib/wiki-engine";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = params;

  // Wiki-first lookup
  const wikiRows = await prisma.$queryRawUnsafe<Array<{
    slug: string; properties: SituationProperties | null;
  }>>(
    `SELECT slug, properties
     FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (wikiRows.length > 0) {
    const page = wikiRows[0];
    const props = page.properties;
    if (!props) {
      return NextResponse.json({ error: "Malformed situation page" }, { status: 500 });
    }

    // Domain scoping
    const visibleDomains = await getVisibleDomainSlugs(operatorId, su.effectiveUserId);
    if (visibleDomains !== "all" && props.domain) {
      if (!visibleDomains.includes(props.domain)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Only allow re-reasoning on certain statuses
    const allowedStatuses = ["detected", "proposed", "reasoning"];
    if (!allowedStatuses.includes(props.status)) {
      return NextResponse.json(
        { error: `Cannot re-reason on situation with status "${props.status}"` },
        { status: 400 },
      );
    }

    // Update wiki page status
    await updatePageWithLock(operatorId, page.slug, (current) => ({
      properties: { ...(current.properties ?? {}), status: "detected" },
    }));

    // Update thin Situation record (fire-and-forget)
    prisma.situation.update({
      where: { id },
      data: { status: "detected", reasoning: null, proposedAction: null },
    }).catch((err) => console.error(`[reason] Thin record update failed for ${id}:`, err));

    await enqueueWorkerJob("reason_situation", operatorId, {
      situationId: id, wikiPageSlug: page.slug,
    });

    return NextResponse.json({ id, status: "reasoning_triggered" });
  }

  // Legacy fallback
  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: { situationType: { select: { scopeEntityId: true } } },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visibleDomainIds = await getVisibleDomainIds(operatorId, su.effectiveUserId);
  if (visibleDomainIds !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !visibleDomainIds.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const allowedStatuses = ["detected", "proposed", "reasoning"];
  if (!allowedStatuses.includes(situation.status)) {
    return NextResponse.json(
      { error: `Cannot re-reason on situation with status "${situation.status}"` },
      { status: 400 },
    );
  }

  await prisma.situation.update({
    where: { id },
    data: { status: "detected", reasoning: null, proposedAction: null },
  });

  await enqueueWorkerJob("reason_situation", operatorId, { situationId: id });

  return NextResponse.json({ id, status: "reasoning_triggered" });
}
