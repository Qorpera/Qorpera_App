import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notification-dispatch";

// ── Send Peer Signal ─────────────────────────────────────────────────────────

interface PeerSignalParams {
  operatorId: string;
  fromAiEntityId: string;
  toAiEntityId: string;
  content: string;
  relatedEntityIds?: string[];
}

export async function sendPeerSignal(params: PeerSignalParams): Promise<void> {
  // Find target AI's department
  const targetAi = await prisma.entity.findUnique({
    where: { id: params.toAiEntityId },
    select: { ownerDomainId: true },
  });

  // Find an admin user in the target department to attach the data record to
  let targetUserId: string | null = null;
  if (targetAi?.ownerDomainId) {
    const adminUser = await prisma.user.findFirst({
      where: {
        operatorId: params.operatorId,
        role: { in: ["admin", "superadmin"] },
      },
      select: { id: true },
    });
    targetUserId = adminUser?.id ?? null;
  }

  // 1. Create data record for context assembly (with sourceAiEntityId for peer signal tracking)
  if (targetUserId) {
    await sendNotification({
      operatorId: params.operatorId,
      userId: targetUserId,
      type: "peer_signal",
      title: "Peer AI signal",
      body: params.content,
      sourceType: "peer_signal",
      sourceAiEntityId: params.fromAiEntityId,
    });
  }

  // 2. Notify admins through sendNotification (respects preferences)
  const admins = await prisma.user.findMany({
    where: {
      operatorId: params.operatorId,
      role: { in: ["admin", "superadmin"] },
    },
    select: { id: true },
  });

  for (const admin of admins) {
    if (admin.id === targetUserId) continue; // already has the data record
    sendNotification({
      operatorId: params.operatorId,
      userId: admin.id,
      type: "peer_signal",
      title: "Cross-domain AI signal",
      body: params.content.slice(0, 300),
      sourceType: "peer_signal",
      sourceId: params.fromAiEntityId,
    }).catch(console.error);
  }
}

// ── Get Peer Signals for AI ──────────────────────────────────────────────────

export async function getPeerSignalsForAi(
  aiEntityId: string,
  since?: Date,
): Promise<Array<{ id: string; body: string; sourceAiEntityId: string | null; createdAt: Date }>> {
  // Find the department this AI belongs to
  const aiEntity = await prisma.entity.findUnique({
    where: { id: aiEntityId },
    select: { operatorId: true, ownerDomainId: true, primaryDomainId: true },
  });
  if (!aiEntity) return [];

  const domainId = aiEntity.ownerDomainId ?? aiEntity.primaryDomainId;
  if (!domainId) return [];

  // Find users in this department via wiki page membership
  const domainEntity = await prisma.entity.findUnique({
    where: { id: domainId },
    select: { operatorId: true },
  });
  // Find all users (admins see everything; members are matched by wiki page domain links)
  const allUsers = await prisma.user.findMany({
    where: { operatorId: aiEntity.operatorId },
    select: { id: true, role: true, wikiPageSlug: true },
  });
  const memberSlugs = allUsers
    .filter((u) => u.wikiPageSlug && u.role !== "admin" && u.role !== "superadmin")
    .map((u) => u.wikiPageSlug!);
  // Find person pages that cross-reference any domain entity — match by primaryDomainId
  const domainPages = memberSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: {
          operatorId: aiEntity.operatorId,
          slug: { in: memberSlugs },
          scope: "operator",
        },
        select: { slug: true, crossReferences: true },
      })
    : [];
  // A domain entity maps to a domain hub slug; look up the slug
  const domainHub = await prisma.knowledgePage.findFirst({
    where: { operatorId: aiEntity.operatorId, subjectEntityId: domainId, pageType: "domain_hub" },
    select: { slug: true },
  });
  const domainSlug = domainHub?.slug;
  const memberUserIds = domainSlug
    ? domainPages
        .filter((p) => p.crossReferences.includes(domainSlug))
        .map((p) => allUsers.find((u) => u.wikiPageSlug === p.slug)?.id)
        .filter(Boolean) as string[]
    : [];
  const adminIds = allUsers.filter((u) => u.role === "admin" || u.role === "superadmin").map((u) => u.id);
  const userIds = [...new Set([...memberUserIds, ...adminIds])];

  if (userIds.length === 0) return [];

  const where: Record<string, unknown> = {
    userId: { in: userIds },
    sourceType: "peer_signal",
    sourceAiEntityId: { not: aiEntityId },
  };
  if (since) {
    where.createdAt = { gt: since };
  }

  return prisma.notification.findMany({
    where,
    select: { id: true, body: true, sourceAiEntityId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
