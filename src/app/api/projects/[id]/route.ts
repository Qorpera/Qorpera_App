import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id } = await params;

  const access = await assertProjectAccess(id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = await prisma.project.findFirst({
    where: { id, operatorId },
    include: {
      template: { select: { id: true, name: true, category: true, analysisFramework: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      members: {
        where: { user: { role: { not: "superadmin" } } },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      deliverables: {
        select: { id: true, title: true, stage: true, confidenceLevel: true, riskCount: true, assignedToId: true, acceptedById: true },
      },
      connectors: true,
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      documents: {
        select: { id: true, fileName: true, mimeType: true, embeddingStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      parentProject: {
        select: { id: true, name: true },
      },
      childProjects: {
        select: { id: true, name: true, status: true, description: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Compute stage counts
  const stageCounts = { intelligence: 0, workboard: 0, deliverable: 0 };
  for (const d of project.deliverables) {
    if (d.stage in stageCounts) {
      stageCounts[d.stage as keyof typeof stageCounts]++;
    }
  }

  const now = new Date();
  const daysLeft = project.dueDate
    ? Math.max(0, Math.ceil((project.dueDate.getTime() - now.getTime()) / 86400000))
    : null;

  // Exclude knowledgeIndex from response (can be very large)
  const { knowledgeIndex: _ki, ...rest } = project;
  return NextResponse.json({ ...rest, stageCounts, daysLeft });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;
  const { id } = await params;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const existing = await prisma.project.findFirst({
    where: { id, operatorId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, description, status, dueDate, config } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (status !== undefined) {
    data.status = status;
    if (status === "completed") data.completedAt = new Date();
  }
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (config !== undefined) data.config = config;

  const updated = await prisma.project.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const { operatorId } = su;

  const project = await prisma.project.findFirst({
    where: { id, operatorId },
    include: { _count: { select: { childProjects: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // If portfolio, delete children first
    if (project._count.childProjects > 0) {
      const childIds = (await tx.project.findMany({
        where: { parentProjectId: id },
        select: { id: true },
      })).map(c => c.id);

      for (const childId of childIds) {
        await cleanProjectDeps(tx, childId);
      }
      await tx.project.deleteMany({ where: { parentProjectId: id } });
    }

    // Clean this project's deps then delete
    await cleanProjectDeps(tx, id);
    await tx.project.delete({ where: { id } });
  });

  return NextResponse.json({ success: true });
}

/** Remove non-cascading FK references so the project can be deleted. */
async function cleanProjectDeps(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], projectId: string) {
  // Unlink nullable FKs (these use onDelete: SetNull or no onDelete)
  await tx.internalDocument.updateMany({ where: { projectId }, data: { projectId: null } });
  await tx.contentChunk.updateMany({ where: { projectId }, data: { projectId: null } });
  await tx.knowledgePage.deleteMany({ where: { projectId } });
  await tx.sourceConnector.updateMany({ where: { projectId }, data: { projectId: null } });
  // Initiative has a unique optional FK — unlink it
  await tx.initiative.updateMany({ where: { projectId }, data: { projectId: null } });
}
