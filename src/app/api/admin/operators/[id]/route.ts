import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const operator = await prisma.operator.findUnique({ where: { id } });
  if (!operator) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!operator.isTestOperator) {
    return NextResponse.json(
      { error: "Only test operators can be deleted from the admin board" },
      { status: 403 },
    );
  }

  // Break entity self-references to avoid circular FK issues
  await prisma.entity.updateMany({
    where: { operatorId: id },
    data: { primaryDomainId: null, mergedIntoId: null },
  });

  // Delete in reverse dependency order
  await prisma.situationEvent.deleteMany({ where: { situation: { operatorId: id } } });
  await prisma.situation.deleteMany({ where: { operatorId: id } });
  await prisma.situationType.deleteMany({ where: { operatorId: id } });
  await prisma.notification.deleteMany({ where: { operatorId: id } });
  await prisma.copilotMessage.deleteMany({ where: { operatorId: id } });
  await prisma.orientationSession.deleteMany({ where: { operatorId: id } });
  await prisma.policyRule.deleteMany({ where: { operatorId: id } });
  await prisma.actionCapability.deleteMany({ where: { operatorId: id } });
  await prisma.event.deleteMany({ where: { operatorId: id } });
  // Project module (children cascade from Project, but delete explicitly for SourceConnector FK)
  await prisma.projectChatMessage.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.projectNotification.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.projectMessage.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.projectDeliverable.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.projectMember.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.projectConnector.deleteMany({ where: { project: { operatorId: id } } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId: id } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId: id } });
  await prisma.contentChunk.deleteMany({ where: { operatorId: id } });
  await prisma.internalDocument.deleteMany({ where: { operatorId: id } });
  await prisma.project.deleteMany({ where: { operatorId: id } });
  await prisma.projectTemplate.deleteMany({ where: { operatorId: id } });
  await prisma.entityMention.deleteMany({ where: { entity: { operatorId: id } } });
  await prisma.propertyValue.deleteMany({ where: { entity: { operatorId: id } } });
  await prisma.relationship.deleteMany({ where: { relationshipType: { operatorId: id } } });
  await prisma.relationshipType.deleteMany({ where: { operatorId: id } });
  await prisma.invite.deleteMany({ where: { operatorId: id } });
  await prisma.userScope.deleteMany({ where: { user: { operatorId: id } } });
  await prisma.session.deleteMany({ where: { user: { operatorId: id } } });
  await prisma.user.deleteMany({ where: { operatorId: id } });
  await prisma.entity.deleteMany({ where: { operatorId: id } });
  await prisma.entityProperty.deleteMany({ where: { entityType: { operatorId: id } } });
  await prisma.entityType.deleteMany({ where: { operatorId: id } });
  await prisma.operator.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
