import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id: projectId } = await params;

  const project = await assertProjectAccess(projectId, operatorId, effectiveUserId, effectiveRole);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Require owner or reviewer role
  if (effectiveRole === "member") {
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: effectiveUserId },
      select: { role: true },
    });
    if (!membership || !["owner", "reviewer"].includes(membership.role)) {
      return NextResponse.json({ error: "Requires owner or reviewer role" }, { status: 403 });
    }
  }

  // Check project has documents
  const docCount = await prisma.internalDocument.count({
    where: { projectId, operatorId },
  });
  if (docCount === 0) {
    return NextResponse.json({ error: "No documents uploaded to this project" }, { status: 400 });
  }

  // Check no compilation already in progress
  if (project.compilationStatus === "compiling") {
    return NextResponse.json({ error: "Compilation already in progress" }, { status: 409 });
  }

  // Check all documents are processed
  const pendingDocs = await prisma.internalDocument.count({
    where: { projectId, operatorId, embeddingStatus: { not: "complete" } },
  });
  if (pendingDocs > 0) {
    return NextResponse.json(
      { error: `${pendingDocs} document(s) still being processed. Wait for all documents to finish before compiling.` },
      { status: 400 },
    );
  }

  // Set status and enqueue
  await prisma.project.update({
    where: { id: projectId },
    data: { compilationStatus: "compiling" },
  });

  await enqueueWorkerJob("compile_project", operatorId, { projectId });

  return NextResponse.json({ status: "compiling" }, { status: 202 });
}
