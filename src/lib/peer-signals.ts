import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

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
    select: { ownerDepartmentId: true },
  });

  // Find an admin user in the target department to attach the notification to
  let targetUserId: string | null = null;
  if (targetAi?.ownerDepartmentId) {
    // Find users with scope to this department who are admins
    const adminUser = await prisma.user.findFirst({
      where: {
        operatorId: params.operatorId,
        role: { in: ["admin", "superadmin"] },
      },
      select: { id: true },
    });
    targetUserId = adminUser?.id ?? null;
  }

  // Create peer signal notification
  if (targetUserId) {
    await prisma.notification.create({
      data: {
        operatorId: params.operatorId,
        userId: targetUserId,
        title: "Peer AI signal",
        body: params.content,
        sourceType: "peer_signal",
        sourceAiEntityId: params.fromAiEntityId,
      },
    });
  }

  // Also notify all admins about cross-department intelligence
  sendNotificationToAdmins({
    operatorId: params.operatorId,
    type: "peer_signal",
    title: "Cross-department AI signal",
    body: params.content.slice(0, 300),
    sourceType: "peer_signal",
    sourceId: params.fromAiEntityId,
    excludeUserId: targetUserId ?? undefined,
  }).catch(console.error);
}

// ── Get Peer Signals for AI ──────────────────────────────────────────────────

export async function getPeerSignalsForAi(
  aiEntityId: string,
  since?: Date,
): Promise<Array<{ id: string; body: string; sourceAiEntityId: string | null; createdAt: Date }>> {
  // Find the department this AI belongs to
  const aiEntity = await prisma.entity.findUnique({
    where: { id: aiEntityId },
    select: { operatorId: true, ownerDepartmentId: true, parentDepartmentId: true },
  });
  if (!aiEntity) return [];

  const departmentId = aiEntity.ownerDepartmentId ?? aiEntity.parentDepartmentId;
  if (!departmentId) return [];

  // Find users in this department
  const deptUsers = await prisma.userScope.findMany({
    where: { departmentEntityId: departmentId },
    select: { userId: true },
  });
  // Also include admins (they see all departments)
  const admins = await prisma.user.findMany({
    where: { operatorId: aiEntity.operatorId, role: { in: ["admin", "superadmin"] } },
    select: { id: true },
  });
  const userIds = [...new Set([...deptUsers.map(u => u.userId), ...admins.map(a => a.id)])];

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
