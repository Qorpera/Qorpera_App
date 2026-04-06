import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/db";
import { reassessCompleteness } from "@/lib/deliverable-completeness";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id, deliverableId } = params;

  const access = await assertProjectAccess(id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deliverable = await prisma.projectDeliverable.findFirst({
    where: { id: deliverableId, projectId: id },
    select: { id: true, content: true },
  });

  if (!deliverable) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  if (!deliverable.content) return NextResponse.json({ error: "No content to assess" }, { status: 400 });

  try {
    await reassessCompleteness(deliverableId);
  } catch (err) {
    console.error("[reassess] Completeness reassessment failed:", err);
    return NextResponse.json({ error: "Reassessment failed" }, { status: 502 });
  }

  const updated = await prisma.projectDeliverable.findUnique({
    where: { id: deliverableId },
    select: { completenessReport: true, confidenceLevel: true },
  });

  return NextResponse.json({
    completenessReport: updated?.completenessReport,
    confidenceLevel: updated?.confidenceLevel,
  });
}
