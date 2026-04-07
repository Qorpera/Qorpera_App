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

  const where: Record<string, unknown> = {
    operatorId,
    status: "resolved",
  };
  if (lastExtraction) {
    where.resolvedAt = { gt: lastExtraction };
  }

  if (aiEntity?.ownerUserId) {
    // Personal AI: count situations assigned to the owning user
    where.assignedUserId = aiEntity.ownerUserId;
  } else if (aiEntity?.ownerDomainId) {
    // Department AI: count situations scoped to this department
    where.situationType = { scopeEntityId: aiEntity.ownerDomainId };
  }
  // HQ AI: all operator situations (no additional filter)

  return prisma.situation.count({ where });
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

  // Build situation filter based on AI entity type
  const baseSituationFilter: Record<string, unknown> = {
    operatorId,
    resolvedAt: { gte: ninetyDaysAgo },
  };

  if (aiEntity.ownerUserId) {
    baseSituationFilter.assignedUserId = aiEntity.ownerUserId;
  } else if (aiEntity.ownerDomainId) {
    baseSituationFilter.situationType = { scopeEntityId: aiEntity.ownerDomainId };
  }

  // Load resolved + dismissed situations
  const [resolvedSituations, dismissedSituations] = await Promise.all([
    prisma.situation.findMany({
      where: { ...baseSituationFilter, status: "resolved" },
      select: {
        id: true,
        situationTypeId: true,
        reasoning: true,
        resolvedAt: true,
        createdAt: true,
        assignedUserId: true,
        triggerEntityId: true,
        situationType: { select: { id: true, name: true, slug: true } },
        executionPlan: {
          select: {
            id: true,
            status: true,
            steps: {
              select: {
                executionMode: true,
                actionCapabilityId: true,
                status: true,
              },
              orderBy: { sequenceOrder: "asc" },
            },
          },
        },
      },
    }),
    prisma.situation.findMany({
      where: { ...baseSituationFilter, status: "dismissed" },
      select: {
        id: true,
        situationTypeId: true,
        situationType: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Find peer AI entities in the same department for cross-AI analysis
  if (domainId) {
    const peerEntities = await prisma.entity.findMany({
      where: {
        operatorId,
        id: { not: aiEntityId },
        entityType: { slug: { in: ["ai-agent", "domain-ai", "hq-ai"] } },
        OR: [
          { ownerDomainId: domainId },
          { primaryDomainId: domainId },
        ],
        status: "active",
      },
      select: { id: true, displayName: true, ownerUserId: true },
    });
    // Load peer situations for comparative analysis
    if (peerEntities.length > 0) {
      const peerUserIds = peerEntities
        .map((p) => p.ownerUserId)
        .filter(Boolean) as string[];

      if (peerUserIds.length > 0) {
        const peerSituations = await prisma.situation.findMany({
          where: {
            operatorId,
            status: "resolved",
            resolvedAt: { gte: ninetyDaysAgo },
            assignedUserId: { in: peerUserIds },
          },
          select: {
            id: true,
            situationTypeId: true,
            triggerEntityId: true,
            reasoning: true,
            resolvedAt: true,
            createdAt: true,
            assignedUserId: true,
            situationType: { select: { id: true, name: true, slug: true } },
            executionPlan: {
              select: {
                id: true,
                status: true,
                steps: {
                  select: {
                    executionMode: true,
                    actionCapabilityId: true,
                    status: true,
                  },
                  orderBy: { sequenceOrder: "asc" },
                },
              },
            },
          },
        });
        resolvedSituations.push(...peerSituations);
      }
    }
  }

  // Resolve action capability names
  const capabilityIds = new Set<string>();
  for (const sit of resolvedSituations) {
    if (sit.executionPlan) {
      for (const step of sit.executionPlan.steps) {
        if (step.actionCapabilityId) capabilityIds.add(step.actionCapabilityId);
      }
    }
  }
  const capabilities = capabilityIds.size > 0
    ? await prisma.actionCapability.findMany({
        where: { id: { in: [...capabilityIds] } },
        select: { id: true, name: true },
      })
    : [];
  const capMap = new Map(capabilities.map((c) => [c.id, c.name]));

  // Resolve AI entity names for peer situations
  const allAiUserIds = new Set<string>();
  for (const sit of resolvedSituations) {
    if (sit.assignedUserId) allAiUserIds.add(sit.assignedUserId);
  }
  const aiEntities = allAiUserIds.size > 0
    ? await prisma.entity.findMany({
        where: {
          operatorId,
          ownerUserId: { in: [...allAiUserIds] },
          entityType: { slug: { in: ["ai-agent", "domain-ai", "hq-ai"] } },
        },
        select: { id: true, displayName: true, ownerUserId: true },
      })
    : [];
  const userToAiEntity = new Map(
    aiEntities.map((e) => [e.ownerUserId!, { id: e.id, name: e.displayName }]),
  );

  // Group by situation type
  const typeMap = new Map<string, SituationTypeGroup>();

  // Count dismissed
  for (const sit of dismissedSituations) {
    const key = sit.situationTypeId;
    if (!typeMap.has(key)) {
      typeMap.set(key, {
        situationTypeId: sit.situationType.id,
        situationTypeName: sit.situationType.name,
        totalDetected: 0,
        totalResolved: 0,
        totalDismissed: 0,
        approaches: [],
      });
    }
    typeMap.get(key)!.totalDismissed++;
    typeMap.get(key)!.totalDetected++;
  }

  // Process resolved
  for (const sit of resolvedSituations) {
    const key = sit.situationTypeId;
    if (!typeMap.has(key)) {
      typeMap.set(key, {
        situationTypeId: sit.situationType.id,
        situationTypeName: sit.situationType.name,
        totalDetected: 0,
        totalResolved: 0,
        totalDismissed: 0,
        approaches: [],
      });
    }
    const group = typeMap.get(key)!;
    group.totalResolved++;
    group.totalDetected++;

    // Determine primary action capability (first action step)
    const plan = sit.executionPlan;
    if (!plan) continue;

    const firstActionStep = plan.steps.find(
      (s) => s.executionMode === "action" && s.actionCapabilityId,
    );
    if (!firstActionStep?.actionCapabilityId) continue;

    const capId = firstActionStep.actionCapabilityId;
    const capName = capMap.get(capId) ?? "unknown";
    const isSuccess = plan.status === "completed";

    // Determine which AI entity handled this
    const aiInfo = sit.assignedUserId
      ? userToAiEntity.get(sit.assignedUserId)
      : null;
    const handlerAiId = aiInfo?.id ?? aiEntityId;
    const handlerAiName = aiInfo?.name ?? aiEntity.displayName;

    // Find or create approach entry
    let approach = group.approaches.find(
      (a) => a.actionCapabilityId === capId && a.aiEntityId === handlerAiId,
    );
    if (!approach) {
      approach = {
        actionCapabilityId: capId,
        actionCapabilityName: capName,
        aiEntityId: handlerAiId,
        aiEntityName: handlerAiName,
        count: 0,
        successCount: 0,
        failedCount: 0,
        avgResolutionHours: 0,
        exampleSituationIds: [],
      };
      group.approaches.push(approach);
    }

    approach.count++;
    if (isSuccess) approach.successCount++;
    else approach.failedCount++;

    // Resolution time
    if (sit.resolvedAt && sit.createdAt) {
      const hours = (sit.resolvedAt.getTime() - sit.createdAt.getTime()) / (1000 * 60 * 60);
      // Running average
      approach.avgResolutionHours =
        ((approach.avgResolutionHours * (approach.count - 1)) + hours) / approach.count;
    }

    if (approach.exampleSituationIds.length < 5) {
      approach.exampleSituationIds.push(sit.id);
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

// ── Extraction Trigger ───────────────────────────────────────────────────────

export async function checkInsightExtractionTrigger(
  operatorId: string,
  userId: string | null,
): Promise<void> {
  if (!userId) return;

  const aiEntity = await prisma.entity.findFirst({
    where: {
      operatorId,
      ownerUserId: userId,
      entityType: { slug: "ai-agent" },
    },
    select: { id: true },
  });
  if (!aiEntity) return;

  // Determine threshold based on operator age
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { createdAt: true },
  });
  if (!operator) return;

  const operatorAgeDays = (Date.now() - operator.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (operatorAgeDays <= 7) {
    // First week: daily cron handles extraction, skip event-driven
    return;
  }

  const threshold = operatorAgeDays <= 28 ? 20 : 40;

  const count = await getSituationsSinceLastExtraction(operatorId, aiEntity.id);
  if (count < threshold) return;

  // Check extraction lock: skip if last extraction was within 1 hour
  const lastExtraction = await getLastExtractionTime(aiEntity.id);
  if (lastExtraction && (Date.now() - lastExtraction.getTime()) < 60 * 60 * 1000) return;

  await extractInsights(operatorId, aiEntity.id);
}
