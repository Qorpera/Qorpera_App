import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";
import { checkGraduation, checkDemotion, checkPersonalGraduation, checkPersonalDemotion } from "@/lib/autonomy-graduation";
import { resumeAfterSituationResolution } from "@/lib/execution-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { handleMeetingRequestResolution } from "@/lib/meeting-coordination";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { recheckWorkStreamStatus } from "@/lib/workstreams";
import { completeDelegation } from "@/lib/delegations";
import { checkInsightExtractionTrigger } from "@/lib/operational-knowledge";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
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

  // Scope check: deny if situation's type is scoped to a department the user can't see
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.effectiveUserId);
  if (visibleDepts !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !visibleDepts.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
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
    executionPlanId: situation.executionPlanId,
    actionTaken: situation.actionTaken ? JSON.parse(situation.actionTaken) : null,
    outcome: situation.outcome,
    outcomeDetails: situation.outcomeDetails,
    feedback: situation.feedback,
    feedbackRating: situation.feedbackRating,
    feedbackCategory: situation.feedbackCategory,
    editInstruction: situation.editInstruction,
    resolvedAt: situation.resolvedAt?.toISOString() ?? null,
    createdAt: situation.createdAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = params;
  const body = await req.json();

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: { situationType: { select: { scopeEntityId: true, slug: true } } },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scope check
  const patchVisibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (patchVisibleDepts !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !patchVisibleDepts.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Billing gate: block status changes and edit instructions for non-active operators
  if (body.status !== undefined || body.editInstruction || body.meetingDecision) {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { billingStatus: true },
    });
    if (operator) {
      const { checkBillingGate } = await import("@/lib/billing-gate");
      const gate = checkBillingGate(operator);
      if (!gate.allowed) {
        return NextResponse.json({ error: gate.reason, code: gate.code }, { status: 403 });
      }
    }
  }

  // Meeting request resolution — custom flow for meeting_request situation type
  if (situation.situationType?.slug === "meeting_request" && body.meetingDecision) {
    try {
      const result = await handleMeetingRequestResolution(id, body.meetingDecision, body.resolutionData || {});
      if (result.resolved) {
        // Trigger parent plan resume
        resumeAfterSituationResolution(id).catch(err =>
          console.error(`[situation-patch] Resume after meeting resolution failed:`, err),
        );
      }
      return NextResponse.json({ id, meetingDecision: body.meetingDecision, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Edit & Approve flow — reset to detected and re-reason with instruction
  if (typeof body.editInstruction === "string" && body.editInstruction.trim()) {
    await prisma.situation.update({
      where: { id },
      data: {
        editInstruction: body.editInstruction.trim(),
        status: "detected",
      },
    });
    enqueueWorkerJob("reason_situation", operatorId, { situationId: id }).catch((err) =>
      console.error(`[situations-api] Failed to enqueue re-reasoning for ${id}:`, err),
    );
    return NextResponse.json({ id, status: "edit_submitted", message: "Edit instruction saved. Revised proposal will appear shortly." });
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
            dismissedCount: { increment: 1 },
          },
        }).catch(() => {});
      }
      // Day 12: demotion check
      checkDemotion(situation.situationTypeId).catch((err) =>
        console.error(`[situation-patch] Demotion check failed:`, err),
      );
      // Personal autonomy tracking
      const aiEntityRejection = await prisma.entity.findFirst({
        where: { ownerUserId: user.id, operatorId, status: "active" },
        select: { id: true },
      });
      if (aiEntityRejection) {
        const pa = await prisma.personalAutonomy.findUnique({
          where: {
            situationTypeId_aiEntityId: {
              situationTypeId: situation.situationTypeId,
              aiEntityId: aiEntityRejection.id,
            },
          },
        });
        if (pa) {
          const newProposed = pa.totalProposed + 1;
          await prisma.personalAutonomy.update({
            where: { id: pa.id },
            data: {
              totalProposed: newProposed,
              consecutiveApprovals: 0,
              approvalRate: newProposed > 0 ? pa.totalApproved / newProposed : 0,
            },
          });
          checkPersonalDemotion(pa.id).catch((err) =>
            console.error(`[situation-patch] Personal demotion check failed:`, err),
          );
        }
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
            confirmedCount: { increment: 1 },
          },
        }).catch(() => {});
      }
      // Day 12: graduation check
      checkGraduation(situation.situationTypeId).catch((err) =>
        console.error(`[situation-patch] Graduation check failed:`, err),
      );
      // Personal autonomy tracking
      const aiEntityApproval = await prisma.entity.findFirst({
        where: { ownerUserId: user.id, operatorId, status: "active" },
        select: { id: true },
      });
      if (aiEntityApproval) {
        let pa = await prisma.personalAutonomy.findUnique({
          where: {
            situationTypeId_aiEntityId: {
              situationTypeId: situation.situationTypeId,
              aiEntityId: aiEntityApproval.id,
            },
          },
        });
        if (!pa) {
          pa = await prisma.personalAutonomy.create({
            data: {
              operatorId,
              situationTypeId: situation.situationTypeId,
              aiEntityId: aiEntityApproval.id,
              totalProposed: 1,
              totalApproved: 1,
              consecutiveApprovals: 1,
              approvalRate: 1.0,
            },
          });
        } else {
          const newProposed = pa.totalProposed + 1;
          const newApproved = pa.totalApproved + 1;
          pa = await prisma.personalAutonomy.update({
            where: { id: pa.id },
            data: {
              totalProposed: newProposed,
              totalApproved: newApproved,
              consecutiveApprovals: pa.consecutiveApprovals + 1,
              approvalRate: newProposed > 0 ? newApproved / newProposed : 0,
            },
          });
        }
        checkPersonalGraduation(pa.id).catch((err) =>
          console.error(`[situation-patch] Personal graduation check failed:`, err),
        );
      }
      // Store approving user so executor can resolve their personal connector token
      updates.assignedUserId = user.id;
    }
  }
  if (body.feedback !== undefined) updates.feedback = body.feedback;
  if (body.feedbackRating !== undefined) updates.feedbackRating = body.feedbackRating;
  if (body.feedbackCategory !== undefined) updates.feedbackCategory = body.feedbackCategory;
  if (body.outcome !== undefined) updates.outcome = body.outcome;
  if (body.outcomeDetails !== undefined) updates.outcomeDetails = JSON.stringify(body.outcomeDetails);
  if (body.outcomeNote !== undefined) updates.outcomeDetails = JSON.stringify({ note: body.outcomeNote });

  const updated = await prisma.situation.update({
    where: { id },
    data: updates,
  });

  // Route approval through execution plan
  if (body.status === "approved") {
    const situationWithPlan = await prisma.situation.findUnique({
      where: { id },
      select: { executionPlanId: true },
    });

    if (situationWithPlan?.executionPlanId) {
      const nextStep = await prisma.executionStep.findFirst({
        where: { planId: situationWithPlan.executionPlanId, status: "awaiting_approval" },
        orderBy: { sequenceOrder: "asc" },
      });
      if (nextStep) {
        // Update assignedUserId on all action steps that don't have one
        await prisma.executionStep.updateMany({
          where: {
            planId: situationWithPlan.executionPlanId,
            executionMode: "action",
            assignedUserId: null,
          },
          data: { assignedUserId: user.id },
        });

        enqueueWorkerJob("advance_step", operatorId, {
          stepId: nextStep.id,
          action: "approve",
          userId: user.id,
        }).catch(err =>
          console.error(`[situation-patch] Failed to enqueue step advance for ${id}:`, err),
        );
      }
    }
  }

  // Trigger WorkStream auto-complete recheck
  if (body.status) {
    prisma.workStreamItem.findMany({
      where: { itemType: "situation", itemId: id },
      select: { workStreamId: true },
    }).then(items => {
      for (const item of items) {
        recheckWorkStreamStatus(item.workStreamId).catch(console.error);
      }
    }).catch(console.error);
  }

  // Auto-complete linked delegation when situation is resolved/dismissed
  if ((body.status === "resolved" || body.status === "dismissed") && situation.delegationId) {
    completeDelegation(situation.delegationId, user.id, `Situation ${body.status}`)
      .catch(console.error);
  }

  // Fire-and-forget: check if insight extraction should run
  if (body.status === "resolved") {
    checkInsightExtractionTrigger(operatorId, situation.assignedUserId).catch(console.error);
  }

  // Resume parent plan if this situation was spawned by an await_situation step
  if (body.status === "resolved" || body.status === "closed" || body.status === "dismissed") {
    resumeAfterSituationResolution(id).catch(err =>
      console.error(`[situation-patch] Resume after resolution failed for ${id}:`, err),
    );
  }

  // Emit billing event for resolved/closed situations (fire-and-forget)
  if (body.status === "resolved" || body.status === "closed") {
    import("@/lib/billing-events")
      .then((m) => m.emitSituationBillingEvent(id))
      .catch(console.error);
  }

  return NextResponse.json({ id: updated.id, status: updated.status });
}
