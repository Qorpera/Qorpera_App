/**
 * Wiki quality monitor — automatic rollback from context evaluation telemetry.
 *
 * Tracks which wiki pages correlate with good/bad reasoning outcomes.
 * Pages with consistently poor outcomes get rolled back to their last
 * known-good version. Pages with strong outcomes get promoted.
 *
 * Thresholds:
 *   - Auto-rollback: effectiveness < -0.5, 5+ citations, prior version exists
 *   - Flag as challenged: effectiveness < -0.2, 3+ citations
 *   - Promote to authoritative: effectiveness > 0.5, 5+ citations
 */

import { prisma } from "@/lib/db";
import { getPageEffectiveness } from "@/lib/context-evaluation";
import { rollbackPage } from "@/lib/wiki-engine";

export interface QualityCheckReport {
  pagesChecked: number;
  pagesRolledBack: number;
  pagesFlagged: number;
  pagesPromoted: number;
  details: Array<{
    slug: string;
    action: "rolled_back" | "flagged" | "promoted" | "healthy";
    reason: string;
    effectivenessScore: number;
    currentVersion: number;
    rolledBackTo?: number;
  }>;
}

export async function runQualityCheck(operatorId: string): Promise<QualityCheckReport> {
  const report: QualityCheckReport = {
    pagesChecked: 0,
    pagesRolledBack: 0,
    pagesFlagged: 0,
    pagesPromoted: 0,
    details: [],
  };

  const effectiveness = await getPageEffectiveness(operatorId);
  report.pagesChecked = effectiveness.length;

  for (const pageStats of effectiveness) {
    if (pageStats.timesInContext < 3) {
      report.details.push({
        slug: pageStats.slug,
        action: "healthy",
        reason: "Insufficient data",
        effectivenessScore: pageStats.effectivenessScore,
        currentVersion: 0,
      });
      continue;
    }

    const page = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: pageStats.slug },
      select: { id: true, version: true, trustLevel: true },
    });

    if (!page) continue;

    // Auto-rollback: very negative effectiveness with enough citations
    if (pageStats.effectivenessScore < -0.5 && pageStats.timesCited >= 5) {
      const previousVersions = await prisma.knowledgePageVersion.findMany({
        where: { pageId: page.id },
        orderBy: { versionNumber: "desc" },
        take: 5,
        select: { versionNumber: true, changeReason: true },
      });

      // Find a version before the current-1 that isn't itself a rollback
      const rollbackTarget = previousVersions.find(v =>
        v.versionNumber < page.version - 1 &&
        v.changeReason !== "rollback"
      );

      if (rollbackTarget) {
        try {
          await rollbackPage(page.id, rollbackTarget.versionNumber);
          report.pagesRolledBack++;
          report.details.push({
            slug: pageStats.slug,
            action: "rolled_back",
            reason: `Effectiveness ${pageStats.effectivenessScore.toFixed(2)} (${pageStats.rejectedWhenCited} rejections / ${pageStats.timesCited} citations). Rolled back to v${rollbackTarget.versionNumber}.`,
            effectivenessScore: pageStats.effectivenessScore,
            currentVersion: page.version,
            rolledBackTo: rollbackTarget.versionNumber,
          });
          console.log(`[quality-monitor] Rolled back "${pageStats.slug}" to v${rollbackTarget.versionNumber} — effectiveness ${pageStats.effectivenessScore.toFixed(2)}`);
          continue;
        } catch (err) {
          console.error(`[quality-monitor] Rollback failed for "${pageStats.slug}":`, err);
        }
      }
    }

    // Flag as challenged: moderately negative effectiveness
    if (pageStats.effectivenessScore < -0.2 && pageStats.timesCited >= 3) {
      if (page.trustLevel !== "challenged" && page.trustLevel !== "quarantined") {
        await prisma.knowledgePage.update({
          where: { id: page.id },
          data: {
            trustLevel: "challenged",
            staleReason: `Quality monitor: effectiveness ${pageStats.effectivenessScore.toFixed(2)} — ${pageStats.rejectedWhenCited} rejections when cited.`,
          },
        });
        report.pagesFlagged++;
        report.details.push({
          slug: pageStats.slug,
          action: "flagged",
          reason: `Effectiveness ${pageStats.effectivenessScore.toFixed(2)} — flagged as challenged`,
          effectivenessScore: pageStats.effectivenessScore,
          currentVersion: page.version,
        });
        continue;
      }
    }

    // Promote: strong positive effectiveness
    if (pageStats.effectivenessScore > 0.5 && pageStats.timesCited >= 5) {
      if (page.trustLevel !== "authoritative") {
        await prisma.knowledgePage.update({
          where: { id: page.id },
          data: { trustLevel: "authoritative" },
        });
        report.pagesPromoted++;
        report.details.push({
          slug: pageStats.slug,
          action: "promoted",
          reason: `Effectiveness ${pageStats.effectivenessScore.toFixed(2)} — promoted to authoritative`,
          effectivenessScore: pageStats.effectivenessScore,
          currentVersion: page.version,
        });
        continue;
      }
    }

    report.details.push({
      slug: pageStats.slug,
      action: "healthy",
      reason: pageStats.effectivenessScore > 0.3
        ? `Strong performer: ${Math.round(pageStats.approvedWhenCited / pageStats.timesCited * 100)}% approval when cited`
        : "Within normal range",
      effectivenessScore: pageStats.effectivenessScore,
      currentVersion: page.version,
    });
  }

  console.log(
    `[quality-monitor] ${operatorId}: ${report.pagesRolledBack} rolled back, ${report.pagesFlagged} flagged, ${report.pagesPromoted} promoted, ` +
    `${report.pagesChecked - report.pagesRolledBack - report.pagesFlagged - report.pagesPromoted} healthy`,
  );

  return report;
}
