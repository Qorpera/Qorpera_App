import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const { id } = params;

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: {
      situationType: true,
    },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse context snapshot
  let contextSnapshot = null;
  try {
    contextSnapshot = situation.contextSnapshot ? JSON.parse(situation.contextSnapshot) : null;
  } catch {
    contextSnapshot = null;
  }

  // Fetch current entity state (may differ from snapshot)
  let currentEntityState = null;
  if (situation.triggerEntityId) {
    const ctx = await getEntityContext(operatorId, situation.triggerEntityId);
    if (ctx) {
      currentEntityState = {
        id: ctx.id,
        displayName: ctx.displayName,
        typeName: ctx.typeName,
        properties: ctx.properties,
        relationships: ctx.relationships,
      };
    }
  }

  return NextResponse.json({
    id: situation.id,
    situationType: {
      id: situation.situationType.id,
      name: situation.situationType.name,
      slug: situation.situationType.slug,
      description: situation.situationType.description,
      autonomyLevel: situation.situationType.autonomyLevel,
    },
    severity: situation.severity,
    confidence: situation.confidence,
    status: situation.status,
    source: situation.source,
    triggerEntityId: situation.triggerEntityId,
    triggerEventId: situation.triggerEventId,
    contextSnapshot,
    currentEntityState,
    reasoning: situation.reasoning ? JSON.parse(situation.reasoning) : null,
    proposedAction: situation.proposedAction ? JSON.parse(situation.proposedAction) : null,
    actionTaken: situation.actionTaken ? JSON.parse(situation.actionTaken) : null,
    outcome: situation.outcome,
    outcomeDetails: situation.outcomeDetails,
    feedback: situation.feedback,
    feedbackRating: situation.feedbackRating,
    resolvedAt: situation.resolvedAt?.toISOString() ?? null,
    createdAt: situation.createdAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const { id } = params;
  const body = await req.json();

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "resolved" || body.status === "closed") {
      updates.resolvedAt = new Date();
    }
    // Update approval/rejection stats on the situation type
    if (body.status === "rejected") {
      const st = await prisma.situationType.findUnique({
        where: { id: situation.situationTypeId },
      });
      if (st) {
        const newProposed = st.totalProposed + 1;
        await prisma.situationType.update({
          where: { id: situation.situationTypeId },
          data: {
            totalProposed: newProposed,
            consecutiveApprovals: 0,
            approvalRate: newProposed > 0 ? st.totalApproved / newProposed : 0,
          },
        }).catch(() => {});
      }
    }
    if (body.status === "approved") {
      const st = await prisma.situationType.findUnique({
        where: { id: situation.situationTypeId },
      });
      if (st) {
        const newProposed = st.totalProposed + 1;
        const newApproved = st.totalApproved + 1;
        await prisma.situationType.update({
          where: { id: situation.situationTypeId },
          data: {
            totalProposed: newProposed,
            totalApproved: newApproved,
            consecutiveApprovals: st.consecutiveApprovals + 1,
            approvalRate: newProposed > 0 ? newApproved / newProposed : 0,
          },
        }).catch(() => {});
      }
    }
  }
  if (body.feedback !== undefined) updates.feedback = body.feedback;
  if (body.feedbackRating !== undefined) updates.feedbackRating = body.feedbackRating;
  if (body.outcome !== undefined) updates.outcome = body.outcome;
  if (body.outcomeDetails !== undefined) updates.outcomeDetails = JSON.stringify(body.outcomeDetails);

  const updated = await prisma.situation.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
