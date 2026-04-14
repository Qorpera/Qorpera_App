import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";
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

    // Thin Situation record no longer exists — wiki page is the source of truth

    await enqueueWorkerJob("reason_situation", operatorId, {
      situationId: id, wikiPageSlug: page.slug,
    });

    return NextResponse.json({ id, status: "reasoning_triggered" });
  }

  // No wiki page found for this situation
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
