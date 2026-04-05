import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deliverable = await prisma.projectDeliverable.findFirst({
    where: { id: params.deliverableId, projectId: params.id },
    select: { id: true, stage: true, content: true },
  });

  if (!deliverable) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  if (deliverable.stage !== "intelligence") {
    return NextResponse.json(
      { error: "Deliverable must be in intelligence stage to generate analysis" },
      { status: 400 },
    );
  }

  const jobId = await enqueueWorkerJob(
    "generate_deliverable",
    operatorId,
    { deliverableId: params.deliverableId, projectId: params.id },
  );

  return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
}
