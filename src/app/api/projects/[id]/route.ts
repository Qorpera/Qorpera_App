import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, operatorId },
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

  return NextResponse.json({ ...project, stageCounts, daysLeft });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const existing = await prisma.project.findFirst({
    where: { id: params.id, operatorId },
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
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}
