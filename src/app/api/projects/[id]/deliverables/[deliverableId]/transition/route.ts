import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

const VALID_STAGES = ["intelligence", "workboard", "deliverable"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deliverable = await prisma.projectDeliverable.findFirst({
    where: { id: params.deliverableId, projectId: params.id },
  });
  if (!deliverable) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const body = await req.json();
  const { targetStage } = body;

  if (!targetStage || !VALID_STAGES.includes(targetStage)) {
    return NextResponse.json(
      { error: `targetStage must be one of: ${VALID_STAGES.join(", ")}` },
      { status: 400 },
    );
  }

  if (targetStage === deliverable.stage) {
    return NextResponse.json({ error: "Already in target stage" }, { status: 400 });
  }

  const data: Record<string, unknown> = { stage: targetStage };

  // If moving to deliverable stage, record acceptance
  if (targetStage === "deliverable") {
    data.acceptedById = effectiveUserId;
    data.acceptedAt = new Date();
  }

  // If moving back from deliverable, clear acceptance
  if (deliverable.stage === "deliverable" && targetStage !== "deliverable") {
    data.acceptedById = null;
    data.acceptedAt = null;
  }

  const updated = await prisma.projectDeliverable.update({
    where: { id: params.deliverableId },
    data,
  });

  return NextResponse.json(updated);
}
