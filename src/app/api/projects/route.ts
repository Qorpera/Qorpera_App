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

  const where: Record<string, unknown> = { operatorId, parentProjectId: null };
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
            childProjects: true,
          },
        },
        deliverables: {
          select: { id: true, stage: true, acceptedById: true },
        },
        childProjects: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            createdAt: true,
            _count: { select: { deliverables: true } },
          },
          orderBy: { createdAt: "asc" },
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
    return { ...rest, parentProjectId: p.parentProjectId ?? null, deliverableCount, completedCount, memberCount, daysLeft, childProjectCount: _count.childProjects };
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
  const { name, description, templateId, dueDate, status: projStatus, members } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Track members with restriction text for post-transaction LLM interpretation
  const membersWithRestrictions: Array<{ userId: string; restrictionText: string }> = [];

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

    // Create owner member (always the creator)
    await tx.projectMember.create({
      data: {
        projectId: p.id,
        userId: effectiveUserId,
        role: "owner",
        addedById: effectiveUserId,
      },
    });

    // Create additional members from wizard payload
    if (Array.isArray(members)) {
      const VALID_ROLES = new Set(["owner", "reviewer", "analyst", "viewer"]);
      const requestedIds = members
        .map((m: { userId?: string }) => m.userId)
        .filter((id: string | undefined): id is string => !!id && id !== effectiveUserId);

      // Validate all userIds belong to this operator
      const validUsers = requestedIds.length > 0
        ? new Set(
            (await tx.user.findMany({
              where: { operatorId, id: { in: requestedIds } },
              select: { id: true },
            })).map((u) => u.id),
          )
        : new Set<string>();

      for (const m of members) {
        if (!m.userId || m.userId === effectiveUserId) continue; // skip creator (already added)
        if (!validUsers.has(m.userId)) continue; // skip users from other operators
        const role = VALID_ROLES.has(m.role) ? m.role : "analyst";
        await tx.projectMember.create({
          data: {
            projectId: p.id,
            userId: m.userId,
            role,
            addedById: effectiveUserId,
          },
        });
        if (m.restrictionText) {
          membersWithRestrictions.push({ userId: m.userId, restrictionText: m.restrictionText });
        }
      }
    }

    // Create deliverables from template analysis framework
    if (templateId) {
      const template = await tx.projectTemplate.findUnique({ where: { id: templateId } });
      if (template?.analysisFramework) {
        const framework = template.analysisFramework as {
          sections: Array<{ id: string; title: string; generationMode: string; description: string }>;
        };
        if (Array.isArray(framework.sections)) {
          for (const section of framework.sections) {
            await tx.projectDeliverable.create({
              data: {
                projectId: p.id,
                title: section.title,
                description: section.description,
                stage: "intelligence",
                generationMode: section.generationMode,
                templateSectionId: section.id,
                riskCount: 0,
              },
            });
          }
        }
      }
    }

    return p;
  });

  // Fire-and-forget: interpret natural-language restrictions via LLM
  if (membersWithRestrictions.length > 0) {
    import("@/lib/project-restrictions")
      .then(({ interpretMemberRestrictions }) =>
        interpretMemberRestrictions(project.id, membersWithRestrictions),
      )
      .catch((err) => {
        console.error("[project-create] Failed to interpret restrictions:", err);
      });
  }

  return NextResponse.json(project, { status: 201 });
}
