import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const stage = req.nextUrl.searchParams.get("stage");
  const where: Record<string, unknown> = { projectId: params.id };
  if (stage) where.stage = stage;

  const deliverables = await prisma.projectDeliverable.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ deliverables });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const { title, description, stage, content } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const deliverable = await prisma.projectDeliverable.create({
    data: {
      projectId: params.id,
      title,
      description: description || null,
      stage: stage || "intelligence",
      generationMode: "human_authored",
      content: content || null,
      assignedToId: effectiveUserId,
    },
  });

  return NextResponse.json(deliverable, { status: 201 });
}
