import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;
  if (effectiveRole === "member") {
    where.members = { some: { userId: effectiveUserId } };
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            members: { where: { user: { role: { not: "superadmin" } } } },
            deliverables: true,
          },
        },
        deliverables: {
          select: { id: true, stage: true, acceptedById: true },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const now = new Date();
  const data = projects.map((p) => {
    const deliverableCount = p._count.deliverables;
    const completedCount = p.deliverables.filter(
      (d) => d.stage === "deliverable" && d.acceptedById != null
    ).length;
    const memberCount = p._count.members;
    const daysLeft = p.dueDate
      ? Math.max(0, Math.ceil((p.dueDate.getTime() - now.getTime()) / 86400000))
      : null;

    const { deliverables, _count, ...rest } = p;
    return { ...rest, deliverableCount, completedCount, memberCount, daysLeft };
  });

  return NextResponse.json({ projects: data, total });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, templateId, dueDate, status: projStatus } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        operatorId,
        name,
        description: description || null,
        templateId: templateId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: projStatus || "draft",
        createdById: effectiveUserId,
      },
    });
    await tx.projectMember.create({
      data: {
        projectId: p.id,
        userId: effectiveUserId,
        role: "owner",
        addedById: effectiveUserId,
      },
    });
    return p;
  });

  return NextResponse.json(project, { status: 201 });
}
