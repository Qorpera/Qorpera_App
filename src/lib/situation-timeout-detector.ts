import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { appendTimelineEntry } from "@/lib/wiki-execution-engine";

const DEFAULT_TIMEOUT_DAYS = 3;

/**
 * Checks for situations in "monitoring" status where the last action cycle
 * completed more than N days ago without any new signal arriving.
 * Triggers re-reasoning with a timeout signal.
 */
export async function checkSituationTimeouts(operatorId: string): Promise<number> {
  const cutoff = new Date(Date.now() - DEFAULT_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);

  // Find situation pages in "monitoring" status
  const monitoringPages = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    properties: Record<string, unknown>;
  }>>(
    `SELECT slug, properties FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND scope = 'operator'
       AND properties->>'status' = 'monitoring'`,
    operatorId,
  );

  let triggered = 0;

  for (const page of monitoringPages) {
    const situationId = (page.properties?.situation_id as string) ?? null;
    if (!situationId) continue;

    // Check last completed cycle
    const lastCycle = await prisma.situationCycle.findFirst({
      where: { situationId, status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, triggerSummary: true },
    });

    if (!lastCycle?.completedAt) continue;
    if (lastCycle.completedAt > cutoff) continue;

    const daysSince = Math.floor(
      (Date.now() - lastCycle.completedAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Update wiki page status back to "detected" for re-reasoning
    await updatePageWithLock(operatorId, page.slug, (p) => {
      const pageProps = (p.properties ?? {}) as Record<string, unknown>;
      pageProps.status = "detected";
      const content = appendTimelineEntry(p.content, `Timeout: no response after ${daysSince} days`);
      return { content, properties: pageProps };
    });

    // Dispatch re-reasoning
    await enqueueWorkerJob("reason_situation", operatorId, {
      situationId,
      wikiPageSlug: page.slug,
    });

    console.log(`[timeout-detector] Situation ${page.slug} timed out after ${daysSince} days`);
    triggered++;
  }

  return triggered;
}
