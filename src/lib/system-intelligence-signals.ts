import { prisma } from "@/lib/db";

/**
 * Emit a signal about system intelligence usage.
 * Fire-and-forget — never blocks the calling process.
 */
export async function emitSystemSignal(params: {
  operatorId: string;
  signalType:
    | "positive_citation"
    | "negative_citation"
    | "correction_signal"
    | "gap_signal"
    | "pattern_discovery"
    | "contradiction_signal"
    | "confirmation_signal";
  systemPageSlug?: string;
  systemPageTitle?: string;
  situationTypeSlug?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: params.operatorId },
      select: { industry: true },
    }).catch(() => null);

    await prisma.systemIntelligenceSignal.create({
      data: {
        operatorId: params.operatorId,
        signalType: params.signalType,
        systemPageSlug: params.systemPageSlug ?? null,
        systemPageTitle: params.systemPageTitle ?? null,
        situationTypeSlug: params.situationTypeSlug ?? null,
        industryVertical: operator?.industry ?? null,
        payload: params.payload as any,
      },
    });
    // Check for cross-domain citation
    if (
      (params.signalType === "positive_citation" || params.signalType === "confirmation_signal") &&
      params.systemPageSlug &&
      params.systemPageTitle
    ) {
      try {
        const { detectCrossDomainCitation } = await import("@/lib/system-intelligence-policy");
        const crossDomain = detectCrossDomainCitation(
          params.systemPageSlug,
          params.systemPageTitle,
          operator?.industry ?? null,
          params.situationTypeSlug ?? null,
        );
        if (crossDomain) {
          await prisma.systemIntelligenceSignal.create({
            data: {
              operatorId: params.operatorId,
              signalType: "cross_domain_citation",
              systemPageSlug: params.systemPageSlug,
              systemPageTitle: params.systemPageTitle,
              situationTypeSlug: params.situationTypeSlug ?? null,
              industryVertical: operator?.industry ?? null,
              payload: {
                ...params.payload,
                pageDomain: crossDomain.pageDomain,
                situationDomain: crossDomain.situationDomain,
                operatorIndustry: operator?.industry ?? null,
              } as any,
            },
          });
        }
      } catch {
        // Cross-domain detection is non-fatal
      }
    }
  } catch (err) {
    // Signal emission is non-fatal — log and continue
    console.warn("[system-signals] Failed to emit signal:", err);
  }
}

/**
 * Log a change to a system intelligence page.
 * Called by the research synthesizer, curator, and admin actions.
 */
export async function logSystemIntelligenceChange(params: {
  action: "page_updated" | "page_created" | "page_archived" | "content_pruned" | "page_split";
  pageSlug: string;
  pageTitle: string;
  pageType?: string;
  previousContent?: string;
  newContent?: string;
  reason: string;
  changeSource: "research_synthesis" | "curator" | "admin" | "verification";
  signalCount?: number;
  signalSummary?: Record<string, unknown>;
  operatorCount?: number;
  curatorModel?: string;
}): Promise<void> {
  try {
    await prisma.systemIntelligenceLog.create({
      data: {
        action: params.action,
        pageSlug: params.pageSlug,
        pageTitle: params.pageTitle,
        pageType: params.pageType ?? null,
        previousContent: params.previousContent ?? null,
        newContent: params.newContent ?? null,
        reason: params.reason,
        changeSource: params.changeSource,
        signalCount: params.signalCount ?? 0,
        signalSummary: (params.signalSummary as any) ?? null,
        operatorCount: params.operatorCount ?? 0,
        curatorModel: params.curatorModel ?? null,
      },
    });
  } catch (err) {
    console.error("[system-signals] Failed to log change:", err);
  }
}
