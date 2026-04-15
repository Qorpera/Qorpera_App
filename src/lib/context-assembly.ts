import { prisma } from "@/lib/db";
import { searchRawContent } from "@/lib/storage/raw-content-store";

// ── Types ────────────────────────────────────────────────────────────────────

interface CommunicationExcerpt {
  sourceType: string;
  content: string;
  metadata: {
    subject?: string;
    sender?: string;
    channel?: string;
    timestamp?: string;
    direction?: string;
  };
  score: number;
}

export interface CommunicationContext {
  excerpts: CommunicationExcerpt[];
  sourceBreakdown: Record<string, number>;
}

export interface ConnectorCapability {
  provider: string;
  type: string;
  scope: "personal" | "company";
}

export interface OperationalInsightContext {
  id: string;
  insightType: string;
  description: string;
  confidence: number;
  promptModification: string | null;
  shareScope: string;
  sampleSize: number;
}

// ── Communication Context ───────────────────────────────────────────────────

export async function loadCommunicationContext(
  operatorId: string,
  situationDescription: string,
  limit: number,
): Promise<CommunicationContext> {
  try {
    const sourceTypes = ["email", "slack_message", "teams_message"];

    // Extract keywords from situation description for text search
    const keywords = situationDescription
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    const query = keywords.join(" ");
    if (!query) return { excerpts: [], sourceBreakdown: {} };

    const allResults = await searchRawContent(operatorId, query, { limit });

    const excerpts: CommunicationExcerpt[] = allResults
      .filter((r) => sourceTypes.includes(r.sourceType))
      .map((r) => {
        const meta = r.rawMetadata ?? {};
        return {
          sourceType: r.sourceType,
          content: r.rawBody ?? "",
          metadata: {
            subject: meta.subject as string | undefined,
            sender: (meta.from as string) ?? (meta.sender as string) ?? undefined,
            channel: meta.channel as string | undefined,
            timestamp: meta.timestamp as string | undefined,
            direction: meta.direction as string | undefined,
          },
          score: 0.5,
        };
      });

    const sourceBreakdown: Record<string, number> = {};
    for (const e of excerpts) {
      sourceBreakdown[e.sourceType] = (sourceBreakdown[e.sourceType] ?? 0) + 1;
    }

    return { excerpts, sourceBreakdown };
  } catch (err) {
    console.warn("[context-assembly] loadCommunicationContext failed:", err);
    return { excerpts: [], sourceBreakdown: {} };
  }
}

// ── Operational Insights ─────────────────────────────────────────────────────

export async function loadOperationalInsights(
  operatorId: string,
  aiEntityId: string | null,
  domainId: string | null,
  situationTypeId?: string,
): Promise<OperationalInsightContext[]> {
  const orConditions: Record<string, unknown>[] = [
    { shareScope: "operator" },
  ];

  if (aiEntityId) {
    orConditions.push({ aiEntityId, shareScope: "personal" });
  }

  if (domainId) {
    orConditions.push({ domainId, shareScope: "department" });
  }

  const allInsights = await prisma.operationalInsight.findMany({
    where: {
      operatorId,
      status: "active",
      OR: orConditions,
    },
    orderBy: { confidence: "desc" },
    take: 50, // fetch more, filter by situationType below
  });

  // Filter to insights relevant to this situation type
  const relevantInsights = allInsights.filter((insight) => {
    if (insight.shareScope === "operator") return true; // operator-scoped apply broadly
    try {
      const evidence = JSON.parse(insight.evidence);
      return (
        !evidence?.situationTypeId ||
        !situationTypeId ||
        evidence.situationTypeId === situationTypeId
      );
    } catch {
      return true;
    }
  }).slice(0, 20);

  return relevantInsights.map((i) => {
    let sampleSize = 0;
    try {
      const evidence = JSON.parse(i.evidence);
      sampleSize = evidence.sampleSize ?? 0;
    } catch {}
    return {
      id: i.id,
      insightType: i.insightType,
      description: i.description,
      confidence: i.confidence,
      promptModification: i.promptModification,
      shareScope: i.shareScope,
      sampleSize,
    };
  });
}
