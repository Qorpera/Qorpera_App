import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { InsightExtractionOutputSchema } from "@/types/insight-types";

// ── Types ────────────────────────────────────────────────────────────────────

type ApproachData = {
  actionCapabilityId: string;
  actionCapabilityName: string;
  aiEntityId: string;
  aiEntityName: string;
  count: number;
  successCount: number;
  failedCount: number;
  avgResolutionHours: number;
  exampleSituationIds: string[];
};

type SituationTypeGroup = {
  situationTypeId: string;
  situationTypeName: string;
  totalDetected: number;
  totalResolved: number;
  totalDismissed: number;
  approaches: ApproachData[];
};

type ExtractionData = {
  aiEntityId: string;
  aiEntityName: string;
  domainId: string;
  domainName: string;
  situationTypeGroups: SituationTypeGroup[];
  timeRange: { from: string; to: string };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getLastExtractionTime(aiEntityId: string): Promise<Date | null> {
  const latest = await prisma.operationalInsight.findFirst({
    where: { aiEntityId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? null;
}

export async function getSituationsSinceLastExtraction(
  operatorId: string,
  aiEntityId: string,
): Promise<number> {
  const lastExtraction = await getLastExtractionTime(aiEntityId);

  // Resolve assignedUserId from AI entity
  const aiEntity = await prisma.entity.findUnique({
    where: { id: aiEntityId },
    select: { ownerUserId: true, ownerDomainId: true, entityType: { select: { slug: true } } },
  });

  const kpWhere: Record<string, unknown> = {
    operatorId,
    pageType: "situation_instance",
    scope: "operator",
    properties: { path: ["status"], equals: "resolved" },
  };
  if (lastExtraction) {
    kpWhere.updatedAt = { gt: lastExtraction };
  }

  // Note: user/domain scoping not available on wiki pages directly; count all operator situations
  return prisma.knowledgePage.count({ where: kpWhere });
}

// ── Data Assembly ────────────────────────────────────────────────────────────

export async function assembleExtractionData(
  operatorId: string,
  aiEntityId: string,
): Promise<ExtractionData | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Load AI entity info
  const aiEntity = await prisma.entity.findUnique({
    where: { id: aiEntityId },
    select: {
      id: true,
      displayName: true,
      ownerUserId: true,
      ownerDomainId: true,
      primaryDomainId: true,
      entityType: { select: { slug: true } },
    },
  });
  if (!aiEntity) return null;

  // Determine department context
  const domainId = aiEntity.ownerDomainId ?? aiEntity.primaryDomainId ?? "";
  let domainName = "HQ";
  if (domainId) {
    const dept = await prisma.entity.findUnique({
      where: { id: domainId },
      select: { displayName: true },
    });
    domainName = dept?.displayName ?? "Unknown";
  }

  // Load resolved + dismissed situation pages from wiki
  const situationPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      updatedAt: { gte: ninetyDaysAgo },
      OR: [
        { properties: { path: ["status"], equals: "resolved" } },
        { properties: { path: ["status"], equals: "dismissed" } },
      ],
    },
    select: { id: true, title: true, content: true, properties: true, createdAt: true, updatedAt: true },
  });

  // Resolve situation type names from IDs found in pages
  const sitTypeIds = new Set<string>();
  for (const p of situationPages) {
    const stId = (p.properties as Record<string, unknown> | null)?.situation_type_id as string | undefined;
    if (stId) sitTypeIds.add(stId);
  }
  const sitTypeRecords = sitTypeIds.size > 0
    ? await prisma.situationType.findMany({
        where: { id: { in: [...sitTypeIds] } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const sitTypeMap = new Map(sitTypeRecords.map((st) => [st.id, st]));

  // Group by situation type
  const typeMap = new Map<string, SituationTypeGroup>();

  for (const page of situationPages) {
    const props = (page.properties ?? {}) as Record<string, unknown>;
    const stId = (props.situation_type_id as string) ?? "unknown";
    const stInfo = sitTypeMap.get(stId);
    const status = props.status as string;

    if (!typeMap.has(stId)) {
      typeMap.set(stId, {
        situationTypeId: stId,
        situationTypeName: stInfo?.name ?? "Unknown",
        totalDetected: 0,
        totalResolved: 0,
        totalDismissed: 0,
        approaches: [],
      });
    }
    const group = typeMap.get(stId)!;
    group.totalDetected++;

    if (status === "resolved") {
      group.totalResolved++;
    } else if (status === "dismissed") {
      group.totalDismissed++;
    }
  }

  return {
    aiEntityId,
    aiEntityName: aiEntity.displayName,
    domainId,
    domainName,
    situationTypeGroups: [...typeMap.values()],
    timeRange: {
      from: ninetyDaysAgo.toISOString(),
      to: new Date().toISOString(),
    },
  };
}

// ── LLM Extraction ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an operational analyst for a business AI system. Your task is to analyze resolved situations and extract actionable patterns.

You will receive data grouped by situation type, showing different approaches used by different AI entities with their success rates.

For each pattern you identify, provide:
1. A clear description of the pattern
2. Evidence with sample sizes and success rates
3. A confidence score (0.0 to 1.0) — only report insights with confidence >= 0.6
4. If the insight has clear behavioral implications, a one-line promptModification that should change how the AI handles future similar situations. This should be a direct instruction, e.g., "When handling [situation type], prefer [approach A] over [approach B] because [evidence-based reason]." Set to null if the insight is observational only (e.g., timing patterns).

IMPORTANT: Look for COMPARATIVE patterns — cases where the same situation type was handled with different approaches and had different outcomes. These are the most valuable insights. A 15%+ difference in success rate between approaches is significant.

Insight types:
- approach_effectiveness: Which actions work best for which situations
- timing_pattern: When actions are most effective (day of week, time of day, response speed)
- entity_preference: How specific entities (clients, partners) prefer to be contacted or handled
- escalation_pattern: When situations need escalation vs. direct resolution
- resolution_pattern: Common step sequences that lead to successful outcomes

Respond ONLY with JSON matching this schema, no other text:
{
  "insights": [
    {
      "insightType": "approach_effectiveness" | "timing_pattern" | "entity_preference" | "escalation_pattern" | "resolution_pattern",
      "description": "Clear description of the pattern",
      "evidence": {
        "sampleSize": number,
        "successRate": number (0.0-1.0),
        "situationTypeId": "string",
        "situationTypeName": "string",
        "actionCapabilityId": "string (primary approach)" | undefined,
        "actionCapabilityName": "string" | undefined,
        "timeRange": { "from": "ISO date", "to": "ISO date" },
        "exampleSituationIds": ["up to 5 IDs"],
        "averageResolutionTimeHours": number | undefined,
        "comparisons": [
          {
            "actionCapabilityId": "string",
            "actionCapabilityName": "string",
            "sampleSize": number,
            "successRate": number,
            "aiEntityIds": ["which AIs used this approach"],
            "averageResolutionTimeHours": number | undefined
          }
        ] | undefined
      },
      "confidence": number (0.0-1.0),
      "promptModification": "One-line behavioral directive" | null
    }
  ]
}

Only include insights where you have sufficient data (sampleSize >= 5, confidence >= 0.6). Quality over quantity — fewer high-confidence insights are better than many weak ones. If comparative data exists, always include the comparisons array.`;

function buildUserPrompt(data: ExtractionData): string {
  let prompt = `Operational data for AI "${data.aiEntityName}" in department "${data.domainName}".\n`;
  prompt += `Time range: ${data.timeRange.from} to ${data.timeRange.to}\n\n`;

  for (const group of data.situationTypeGroups) {
    prompt += `## Situation Type: ${group.situationTypeName} (${group.situationTypeId})\n`;
    prompt += `Total detected: ${group.totalDetected}, Resolved: ${group.totalResolved}, Dismissed: ${group.totalDismissed}\n\n`;

    if (group.approaches.length === 0) {
      prompt += `No action approaches recorded.\n\n`;
      continue;
    }

    prompt += `Approaches:\n`;
    for (const a of group.approaches) {
      const successRate = a.count > 0 ? (a.successCount / a.count * 100).toFixed(1) : "0";
      const isCurrentAi = a.aiEntityId === data.aiEntityId;
      prompt += `- ${a.actionCapabilityName} (${a.actionCapabilityId})`;
      prompt += ` by ${isCurrentAi ? "THIS AI" : a.aiEntityName} (${a.aiEntityId})`;
      prompt += `: ${a.count} uses, ${successRate}% success`;
      prompt += `, avg ${a.avgResolutionHours.toFixed(1)}h resolution`;
      prompt += `, examples: [${a.exampleSituationIds.join(", ")}]\n`;
    }
    prompt += `\n`;
  }

  return prompt;
}

/** @deprecated Use extractOperatorInsights instead */
export async function extractInsights(
  operatorId: string,
  aiEntityId: string,
): Promise<{ created: number; superseded: number; skipped: number }> {
  const data = await assembleExtractionData(operatorId, aiEntityId);
  if (!data) return { created: 0, superseded: 0, skipped: 0 };

  // Filter out types with fewer than 5 resolved situations
  data.situationTypeGroups = data.situationTypeGroups.filter(
    (g) => g.totalResolved >= 5,
  );

  if (data.situationTypeGroups.length === 0) {
    return { created: 0, superseded: 0, skipped: 0 };
  }

  const response = await callLLM({
    instructions: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(data) }],
    aiFunction: "reasoning",
    temperature: 0.3,
    model: getModel("insightExtraction"),
    operatorId,
    webSearch: true,
    thinking: true,
    thinkingBudget: getThinkingBudget("insightExtraction") ?? undefined,
  });

  // Parse and validate LLM output
  let parsed;
  try {
    parsed = InsightExtractionOutputSchema.parse(JSON.parse(response.text));
  } catch {
    console.error("Insight extraction: LLM output failed validation", response.text.slice(0, 200));
    return { created: 0, superseded: 0, skipped: 0 };
  }

  let created = 0;
  let superseded = 0;
  let skipped = 0;

  for (const insight of parsed.insights) {
    // Validate minimum thresholds
    if (insight.evidence.sampleSize < 5 || insight.confidence < 0.6) {
      skipped++;
      continue;
    }

    // Check for existing active insight with same type + situationType + aiEntity
    const existingInsights = await prisma.operationalInsight.findMany({
      where: {
        aiEntityId,
        insightType: insight.insightType,
        status: "active",
      },
    });

    // Find the one matching this situation type
    const matchingExisting = existingInsights.find((existing) => {
      try {
        const existingEvidence = JSON.parse(existing.evidence);
        return existingEvidence?.situationTypeId === insight.evidence.situationTypeId;
      } catch {
        return false;
      }
    });

    if (matchingExisting) {
      if (insight.confidence <= matchingExisting.confidence) {
        skipped++;
        continue;
      }
      // Supersede old insight
      await prisma.operationalInsight.update({
        where: { id: matchingExisting.id },
        data: { status: "superseded" },
      });
      superseded++;
    }

    const newInsight = await prisma.operationalInsight.create({
      data: {
        operatorId,
        aiEntityId,
        domainId: data.domainId || null,
        insightType: insight.insightType,
        description: insight.description,
        evidence: JSON.stringify(insight.evidence),
        confidence: insight.confidence,
        promptModification: insight.promptModification,
        shareScope: "personal",
        status: "active",
      },
    });
    created++;

    // Evaluate promotion (fire-and-forget)
    const { evaluateInsightPromotion } = await import("@/lib/knowledge-transfer");
    evaluateInsightPromotion(newInsight.id).catch((err) =>
      console.error(`Insight promotion check failed for ${newInsight.id}:`, err),
    );
  }

  return { created, superseded, skipped };
}

// ── Wiki-Based Insight Extraction ────────────────────────────────────────────

export async function extractOperatorInsights(operatorId: string): Promise<{
  insightsCreated: number;
  costCents: number;
}> {
  const { extractJSONAny } = await import("@/lib/json-helpers");
  let costCents = 0;

  // 1. Load domain hubs
  const domains = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "domain_hub",
      status: { in: ["draft", "verified"] },
    },
    select: { slug: true, title: true, content: true },
  });

  // 2. Load situation type performance
  const sitTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
    select: {
      id: true, name: true, slug: true, wikiPageSlug: true,
      totalProposed: true, totalApproved: true, approvalRate: true,
      consecutiveApprovals: true, autonomyLevel: true,
      detectedCount: true, confirmedCount: true, dismissedCount: true,
    },
  });

  // 3. Load recent situation history (last 30 days) from wiki pages
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const recentSituationPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { title: true, properties: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Resolve situation type names for display
  const recentStIds = new Set<string>();
  for (const p of recentSituationPages) {
    const stId = (p.properties as Record<string, unknown> | null)?.situation_type_id as string | undefined;
    if (stId) recentStIds.add(stId);
  }
  const recentStRecords = recentStIds.size > 0
    ? await prisma.situationType.findMany({
        where: { id: { in: [...recentStIds] } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const recentStMap = new Map(recentStRecords.map((st) => [st.id, st]));

  // Adapt to the shape the LLM prompt expects
  const recentSituations = recentSituationPages.map((p) => {
    const props = (p.properties ?? {}) as Record<string, unknown>;
    const stId = props.situation_type_id as string | undefined;
    const stInfo = stId ? recentStMap.get(stId) : undefined;
    return {
      status: (props.status as string) ?? "unknown",
      triggerSummary: p.title,
      createdAt: p.createdAt,
      resolvedAt: props.resolved_at ? new Date(props.resolved_at as string) : null,
      severity: (props.severity as string) ?? null,
      confidence: (props.confidence as number) ?? null,
      situationType: { name: stInfo?.name ?? "Unknown", slug: stInfo?.slug ?? "unknown" },
      domainPageSlug: (props.domain as string) ?? null,
      triggerPageSlug: (props.trigger_page_slug as string) ?? null,
    };
  });

  // 4. Total communication volume (30d)
  const totalComms = await prisma.rawContent.count({
    where: {
      operatorId,
      occurredAt: { gte: thirtyDaysAgo },
      sourceType: { in: ["email", "slack_message", "teams_message"] },
    },
  });

  // 5. Generate insights per domain
  let insightsCreated = 0;

  for (const domain of domains) {
    const domainSituations = recentSituations.filter(s => s.domainPageSlug === domain.slug);

    if (domainSituations.length === 0 && sitTypes.length === 0) continue;

    const response = await callLLM({
      operatorId,
      instructions: `You are an operational analyst generating insights for a specific department. Read the department's wiki page, its situation history, and situation type performance. Generate 1-3 specific, actionable insights.

An insight is an observation about an operational pattern — something the team should know, optimize, or investigate. Examples:
- "Invoice processing has slowed 40% this month — 8 situations vs 5 average"
- "Client communication situations resolve 2x faster when assigned to Sarah vs auto-handling"
- "The weekly-report situation type has 95% approval rate — consider graduating to autonomous"

NOT generic advice. Must be grounded in the data provided.`,
      messages: [{
        role: "user",
        content: `Generate operational insights for this department:

DEPARTMENT: ${domain.title}
${domain.content.slice(0, 800)}

RECENT SITUATIONS FOR THIS DOMAIN (${domainSituations.length}):
${domainSituations.slice(0, 20).map(s => {
  const resolutionTime = s.resolvedAt && s.createdAt
    ? Math.round((s.resolvedAt.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60)) + "h"
    : "unresolved";
  return `- [${s.status}] ${s.situationType.name}: ${s.triggerSummary?.slice(0, 80)} (${resolutionTime})`;
}).join("\n")}

SITUATION TYPE PERFORMANCE:
${sitTypes.map(st => `- ${st.name}: detected=${st.detectedCount}, confirmed=${st.confirmedCount}, dismissed=${st.dismissedCount}, approval=${(st.approvalRate * 100).toFixed(0)}%, autonomy=${st.autonomyLevel}`).join("\n") || "No situation types yet."}

TOTAL COMMUNICATION VOLUME (30d): ${totalComms} messages

Generate insights. Respond with ONLY JSON:
{
  "insights": [
    {
      "type": "trend | efficiency | graduation_candidate | workload | pattern",
      "description": "The specific insight — what's happening and why it matters",
      "confidence": 0.8
    }
  ]
}`,
      }],
      model: getModel("agenticReasoning"),
      maxTokens: 4000,
    });

    costCents += response.apiCostCents;

    const parsed = extractJSONAny(response.text) as { insights?: Array<{ type: string; description: string; confidence: number }> } | null;

    if (parsed?.insights) {
      for (const insight of parsed.insights) {
        if (!insight.description || insight.confidence < 0.5) continue;

        await prisma.operationalInsight.create({
          data: {
            operatorId,
            domainPageSlug: domain.slug,
            insightType: insight.type || "pattern",
            description: insight.description,
            evidence: JSON.stringify({ domain: domain.slug, situationCount: domainSituations.length, confidence: insight.confidence }),
            confidence: insight.confidence,
            shareScope: "operator",
            status: "active",
          },
        });
        insightsCreated++;
      }
    }
  }

  return { insightsCreated, costCents };
}

// ── Extraction Trigger ───────────────────────────────────────────────────────

export async function checkInsightExtractionTrigger(
  operatorId: string,
  _userId: string | null,
): Promise<void> {
  // Check if insights are due based on last extraction time
  const lastInsight = await prisma.operationalInsight.findFirst({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // Skip if last extraction was within 1 hour
  if (lastInsight && (Date.now() - lastInsight.createdAt.getTime()) < 60 * 60 * 1000) return;

  // Determine threshold based on operator age
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { createdAt: true },
  });
  if (!operator) return;

  const ageDays = (Date.now() - operator.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return; // First week: daily cron handles it

  // Count recent situations as trigger
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const recentCount = await prisma.knowledgePage.count({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const threshold = ageDays <= 28 ? 20 : 40;
  if (recentCount < threshold) return;

  await extractOperatorInsights(operatorId);
}
