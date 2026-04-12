import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ────────────────────────────────────────────────────────────────────

export type PromotionResult = {
  promoted: boolean;
  reason: "auto_corroborated" | "flagged_for_review" | "no_promotion";
  corroboratingAiEntityIds?: string[];
};

// ── Evaluate Insight Promotion ───────────────────────────────────────────────

export async function evaluateInsightPromotion(insightId: string): Promise<PromotionResult> {
  // 1. Load the insight
  const insight = await prisma.operationalInsight.findUnique({
    where: { id: insightId },
  });
  if (!insight || insight.status !== "active" || insight.shareScope !== "personal") {
    return { promoted: false, reason: "no_promotion" };
  }

  // Parse evidence to get situationTypeId and actionCapabilityId
  let situationTypeId: string | undefined;
  let actionCapabilityId: string | undefined;
  let sampleSize = 0;
  try {
    const evidence = JSON.parse(insight.evidence);
    situationTypeId = evidence.situationTypeId;
    actionCapabilityId = evidence.actionCapabilityId;
    sampleSize = evidence.sampleSize ?? 0;
  } catch {
    return { promoted: false, reason: "no_promotion" };
  }
  if (!situationTypeId) return { promoted: false, reason: "no_promotion" };

  // 2. Find the department
  if (!insight.aiEntityId) return { promoted: false, reason: "no_promotion" };
  const aiEntity = await prisma.entity.findUnique({
    where: { id: insight.aiEntityId },
    select: {
      ownerUserId: true,
      ownerDomainId: true,
      primaryDomainId: true,
      entityType: { select: { slug: true } },
    },
  });
  if (!aiEntity) return { promoted: false, reason: "no_promotion" };

  // HQ AI skips promotion
  if (aiEntity.entityType.slug === "hq-ai") {
    return { promoted: false, reason: "no_promotion" };
  }

  let domainId: string | null = null;
  if (aiEntity.entityType.slug === "domain-ai") {
    domainId = aiEntity.ownerDomainId;
  } else if (aiEntity.ownerUserId) {
    // Personal AI: find user's department
    const scope = await prisma.userScope.findFirst({
      where: { userId: aiEntity.ownerUserId },
      select: { domainEntityId: true },
    });
    domainId = scope?.domainEntityId ?? aiEntity.primaryDomainId;
  }

  if (!domainId) return { promoted: false, reason: "no_promotion" };

  // 3. Find peer AI entities in the same department
  const peerAiEntities = await prisma.entity.findMany({
    where: {
      operatorId: insight.operatorId,
      id: { not: insight.aiEntityId },
      entityType: { slug: { in: ["ai-agent", "domain-ai"] } },
      OR: [
        { ownerDomainId: domainId },
        { primaryDomainId: domainId },
      ],
      status: "active",
    },
    select: { id: true },
  });

  // 4. Check corroboration
  const corroboratingIds: string[] = [];
  for (const peer of peerAiEntities) {
    const peerInsights = await prisma.operationalInsight.findMany({
      where: {
        aiEntityId: peer.id,
        insightType: insight.insightType,
        status: "active",
        confidence: { gte: 0.5 },
      },
    });

    for (const pi of peerInsights) {
      try {
        const peerEvidence = JSON.parse(pi.evidence);
        if (peerEvidence.situationTypeId !== situationTypeId) continue;
        if (actionCapabilityId && peerEvidence.actionCapabilityId !== actionCapabilityId) continue;
        corroboratingIds.push(peer.id);
        break; // One match per peer is enough
      } catch {
        continue;
      }
    }
  }

  // 5. Decision
  if (corroboratingIds.length >= 2) {
    // Auto-promote: this insight + corroborating peers
    await prisma.operationalInsight.update({
      where: { id: insightId },
      data: { shareScope: "department" },
    });

    // Promote corroborating peer insights too
    for (const peerId of corroboratingIds) {
      await prisma.operationalInsight.updateMany({
        where: {
          aiEntityId: peerId,
          insightType: insight.insightType,
          status: "active",
          shareScope: "personal",
        },
        data: { shareScope: "department" },
      });
    }

    await sendNotificationToAdmins({
      operatorId: insight.operatorId,
      type: "insight_discovered",
      title: "Insight auto-promoted to department",
      body: `${insight.description}. Corroborated by ${corroboratingIds.length} AI entities.`,
      sourceType: "insight",
      sourceId: insightId,
    });

    return { promoted: true, reason: "auto_corroborated", corroboratingAiEntityIds: corroboratingIds };
  }

  if (corroboratingIds.length <= 1 && insight.confidence >= 0.85 && sampleSize >= 10) {
    // Flag for review
    const aiEntityName = await prisma.entity.findUnique({
      where: { id: insight.aiEntityId },
      select: { displayName: true },
    });

    await sendNotificationToAdmins({
      operatorId: insight.operatorId,
      type: "insight_discovered",
      title: `${aiEntityName?.displayName ?? "AI"}'s AI learned something`,
      body: `${insight.description}. Promote to department knowledge?`,
      sourceType: "insight",
      sourceId: insightId,
    });

    return { promoted: false, reason: "flagged_for_review" };
  }

  return { promoted: false, reason: "no_promotion" };
}

// ── Manual Promotion ─────────────────────────────────────────────────────────

export async function promoteInsight(
  insightId: string,
  targetScope: "domain" | "operator",
  promotedById: string,
): Promise<void> {
  const insight = await prisma.operationalInsight.findUnique({
    where: { id: insightId },
  });
  if (!insight || insight.status !== "active") {
    throw new Error("Insight not found or not active");
  }

  // Validate scope transition order
  if (insight.shareScope === "personal" && targetScope === "operator") {
    throw new Error("Cannot promote directly from personal to operator. Must go personal → department → operator.");
  }
  if (insight.shareScope === "domain" && targetScope === "domain") {
    throw new Error("Insight is already department-scoped");
  }
  if (insight.shareScope === "operator") {
    throw new Error("Insight is already operator-scoped");
  }

  await prisma.operationalInsight.update({
    where: { id: insightId },
    data: { shareScope: targetScope },
  });

  await sendNotificationToAdmins({
    operatorId: insight.operatorId,
    type: "insight_discovered",
    title: `Insight promoted to ${targetScope}`,
    body: insight.description,
    sourceType: "insight",
    sourceId: insightId,
  });
}

// ── Invalidation ─────────────────────────────────────────────────────────────

export async function invalidateInsight(
  insightId: string,
  invalidatedById: string,
): Promise<void> {
  const insight = await prisma.operationalInsight.findUnique({
    where: { id: insightId },
  });
  if (!insight) throw new Error("Insight not found");

  await prisma.operationalInsight.update({
    where: { id: insightId },
    data: { status: "invalidated" },
  });

  await sendNotificationToAdmins({
    operatorId: insight.operatorId,
    type: "insight_discovered",
    title: "Insight invalidated",
    body: insight.description,
    sourceType: "insight",
    sourceId: insightId,
  });
}
