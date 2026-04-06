import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id, deliverableId } = await params;

  const access = await assertProjectAccess(id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deliverable = await prisma.projectDeliverable.findFirst({
    where: { id: deliverableId, projectId: id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!deliverable) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  return NextResponse.json(deliverable);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id, deliverableId } = await params;

  const access = await assertProjectAccess(id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const existing = await prisma.projectDeliverable.findFirst({
    where: { id: deliverableId, projectId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const body = await req.json();
  const { stage, assignedToId, content, confidenceLevel, riskCount, title, description } = body;

  const data: Record<string, unknown> = {};
  if (stage !== undefined) data.stage = stage;
  if (assignedToId !== undefined) data.assignedToId = assignedToId;
  if (content !== undefined) data.content = content;
  if (confidenceLevel !== undefined) data.confidenceLevel = confidenceLevel;
  if (riskCount !== undefined) data.riskCount = riskCount;
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;

  const updated = await prisma.projectDeliverable.update({
    where: { id: deliverableId, projectId: id },
    data,
  });

  // Re-assess completeness after content edit (fire-and-forget)
  if (content !== undefined) {
    import("@/lib/deliverable-completeness")
      .then(({ reassessCompleteness }) => reassessCompleteness(deliverableId))
      .catch(err => console.error("[deliverable-api] Completeness reassessment failed:", err));
  }

  return NextResponse.json(updated);
}
