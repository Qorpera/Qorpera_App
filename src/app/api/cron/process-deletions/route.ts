import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = {
    operatorsDeleted: 0,
    usersDeleted: 0,
    errors: [] as string[],
  };

  // ── Step 1: Process operator-level deletions first ────────────────────────
  const operatorsToDelete = await prisma.operator.findMany({
    where: { deletionScheduledFor: { lte: now } },
    select: { id: true, displayName: true, email: true },
  });

  const deletingOperatorIds = new Set(operatorsToDelete.map((o) => o.id));

  for (const operator of operatorsToDelete) {
    try {
      await deleteOperator(operator.id);
      results.operatorsDeleted++;
      console.log(`[process-deletions] Operator deleted: ${operator.displayName} (${operator.id})`);

      if (operator.email) {
        sendEmail({
          to: operator.email,
          subject: "Your Qorpera organization has been deleted",
          html: `<p>All data for <strong>${operator.displayName}</strong> has been permanently deleted per your request.</p>`,
        }).catch(() => {});
      }
    } catch (err) {
      const msg = `Operator ${operator.id}: ${err}`;
      results.errors.push(msg);
      console.error("[process-deletions]", msg);
    }
  }

  // ── Step 2: Process user-level deletions ──────────────────────────────────
  const usersToDelete = await prisma.user.findMany({
    where: {
      deletionScheduledFor: { lte: now },
      accountSuspended: true,
    },
    include: { operator: { select: { displayName: true } } },
  });

  for (const user of usersToDelete) {
    // Skip if operator is being deleted in this same run
    if (deletingOperatorIds.has(user.operatorId)) continue;

    try {
      await deleteUser(user.id, user.operatorId);
      results.usersDeleted++;
      console.log(`[process-deletions] User deleted: ${user.name} (${user.id})`);

      // Notify operator admins
      const admins = await prisma.user.findMany({
        where: { operatorId: user.operatorId, role: "admin" },
        select: { email: true },
      });
      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `Account data deleted: ${user.name}`,
          html: `<p><strong>${user.name}</strong>'s data has been permanently deleted per the scheduled deletion request.</p>`,
        }).catch(() => {});
      }
    } catch (err) {
      const msg = `User ${user.id}: ${err}`;
      results.errors.push(msg);
      console.error("[process-deletions]", msg);
    }
  }

  return NextResponse.json(results);
}

// ── User deletion ───────────────────────────────────────────────────────────

async function deleteUser(userId: string, operatorId: string) {
  // Find user's personal AI entity
  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: userId },
    select: { id: true },
  });
  const aiEntityId = aiEntity?.id;

  // Step 1: Reassign situations
  const situations = await prisma.situation.findMany({
    where: { assignedUserId: userId, operatorId },
    select: { id: true, delegationId: true },
  });

  for (const sit of situations) {
    const reassignTarget = await findReassignmentTarget(sit.delegationId, userId, operatorId);
    if (reassignTarget) {
      await prisma.situation.update({
        where: { id: sit.id },
        data: { assignedUserId: reassignTarget },
      });
      console.log(`[process-deletions] Reassigned situation ${sit.id} from ${userId} to ${reassignTarget}`);
    } else {
      // No target — null out assignment
      await prisma.situation.update({
        where: { id: sit.id },
        data: { assignedUserId: null },
      });
    }
  }

  // Step 2: Delete personal data (order matters for FK constraints)
  // Null out delegation references to this user
  await prisma.delegation.updateMany({
    where: { toUserId: userId },
    data: { toUserId: null },
  });
  await prisma.contentChunk.deleteMany({ where: { userId } });
  await prisma.copilotMessage.deleteMany({ where: { userId } });

  if (aiEntityId) {
    await prisma.personalAutonomy.deleteMany({ where: { aiEntityId } });
    await prisma.operationalInsight.deleteMany({
      where: { aiEntityId, shareScope: "personal" },
    });
    await prisma.activitySignal.deleteMany({ where: { actorEntityId: aiEntityId } });
  }

  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.userScope.deleteMany({ where: { userId } });

  // Delete user's personal connectors + their sync logs (SyncLog has no cascade)
  const userConnectors = await prisma.sourceConnector.findMany({
    where: { userId },
    select: { id: true },
  });
  if (userConnectors.length > 0) {
    const connectorIds = userConnectors.map((c) => c.id);
    await prisma.syncLog.deleteMany({ where: { connectorId: { in: connectorIds } } });
    await prisma.contentChunk.deleteMany({ where: { connectorId: { in: connectorIds } } });
    await prisma.event.deleteMany({ where: { connectorId: { in: connectorIds } } });
    await prisma.sourceConnector.deleteMany({ where: { userId } });
  }

  // Delete personal AI entity (cascades EntityProperty/PropertyValue)
  if (aiEntityId) {
    await prisma.propertyValue.deleteMany({ where: { entityId: aiEntityId } });
    await prisma.entityMention.deleteMany({ where: { entityId: aiEntityId } });
    await prisma.relationship.deleteMany({
      where: { OR: [{ fromEntityId: aiEntityId }, { toEntityId: aiEntityId }] },
    });
    await prisma.entity.delete({ where: { id: aiEntityId } });
  }

  // Delete the user record
  await prisma.user.delete({ where: { id: userId } });
}

async function findReassignmentTarget(
  delegationId: string | null,
  userId: string,
  operatorId: string,
): Promise<string | null> {
  // 1. If situation has a delegation, reassign to the delegator's user
  if (delegationId) {
    const delegation = await prisma.delegation.findUnique({
      where: { id: delegationId },
      select: { fromAiEntityId: true },
    });
    if (delegation) {
      const delegatorEntity = await prisma.entity.findUnique({
        where: { id: delegation.fromAiEntityId },
        select: { ownerUserId: true },
      });
      if (delegatorEntity?.ownerUserId && delegatorEntity.ownerUserId !== userId) {
        return delegatorEntity.ownerUserId;
      }
    }
  }

  // 2. Find first admin in user's department
  const userScopes = await prisma.userScope.findMany({
    where: { userId },
    select: { departmentEntityId: true },
  });
  if (userScopes.length > 0) {
    const deptAdmin = await prisma.user.findFirst({
      where: {
        operatorId,
        role: "admin",
        id: { not: userId },
        scopes: { some: { departmentEntityId: { in: userScopes.map((s) => s.departmentEntityId) } } },
      },
      select: { id: true },
    });
    if (deptAdmin) return deptAdmin.id;
  }

  // 3. Fall back to any admin in the operator
  const admin = await prisma.user.findFirst({
    where: { operatorId, role: "admin", id: { not: userId } },
    select: { id: true },
  });
  return admin?.id ?? null;
}

// ── Operator deletion ───────────────────────────────────────────────────────

async function deleteOperator(operatorId: string) {
  // Size check — warn if large
  const entityCount = await prisma.entity.count({ where: { operatorId } });
  if (entityCount > 10000) {
    console.warn(`[process-deletions] Large operator (${entityCount} entities) — deletion may be slow`);
  }

  // Break entity self-references
  await prisma.entity.updateMany({
    where: { operatorId },
    data: { parentDepartmentId: null, mergedIntoId: null },
  });

  // Delete in reverse dependency order (mirrors admin operator delete)
  await prisma.situationEvent.deleteMany({ where: { situation: { operatorId } } });
  await prisma.executionStep.deleteMany({ where: { plan: { operatorId } } });
  await prisma.executionPlan.deleteMany({ where: { operatorId } });
  await prisma.situation.deleteMany({ where: { operatorId } });
  await prisma.situationType.deleteMany({ where: { operatorId } });
  await prisma.notification.deleteMany({ where: { operatorId } });
  await prisma.copilotMessage.deleteMany({ where: { operatorId } });
  await prisma.orientationSession.deleteMany({ where: { operatorId } });
  await prisma.policyRule.deleteMany({ where: { operatorId } });
  await prisma.actionCapability.deleteMany({ where: { operatorId } });
  await prisma.event.deleteMany({ where: { operatorId } });
  await prisma.activitySignal.deleteMany({ where: { operatorId } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId } });
  await prisma.contentChunk.deleteMany({ where: { operatorId } });
  await prisma.internalDocument.deleteMany({ where: { operatorId } });
  await prisma.operationalInsight.deleteMany({ where: { operatorId } });
  await prisma.personalAutonomy.deleteMany({ where: { operatorId } });
  await prisma.delegation.deleteMany({ where: { operatorId } });
  await prisma.followUp.deleteMany({ where: { operatorId } });
  await prisma.recurringTask.deleteMany({ where: { operatorId } });
  await prisma.initiative.deleteMany({ where: { operatorId } });
  await prisma.workStream.deleteMany({ where: { operatorId } });
  await prisma.planAutonomy.deleteMany({ where: { operatorId } });
  await prisma.priorityOverride.deleteMany({ where: { operatorId } });
  await prisma.entityMention.deleteMany({ where: { entity: { operatorId } } });
  await prisma.propertyValue.deleteMany({ where: { entity: { operatorId } } });
  await prisma.relationship.deleteMany({ where: { relationshipType: { operatorId } } });
  await prisma.relationshipType.deleteMany({ where: { operatorId } });
  await prisma.invite.deleteMany({ where: { operatorId } });
  await prisma.notificationPreference.deleteMany({ where: { user: { operatorId } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { operatorId } } });
  await prisma.userScope.deleteMany({ where: { user: { operatorId } } });
  await prisma.session.deleteMany({ where: { user: { operatorId } } });
  await prisma.user.deleteMany({ where: { operatorId } });
  await prisma.entity.deleteMany({ where: { operatorId } });
  await prisma.entityProperty.deleteMany({ where: { entityType: { operatorId } } });
  await prisma.entityType.deleteMany({ where: { operatorId } });
  await prisma.appSetting.deleteMany({ where: { operatorId } });
  await prisma.operator.delete({ where: { id: operatorId } });
}
