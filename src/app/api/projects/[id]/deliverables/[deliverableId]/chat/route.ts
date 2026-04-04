import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const messages = await prisma.projectChatMessage.findMany({
    where: { projectId: params.id, deliverableId: params.deliverableId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ messages });
}

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
    select: { id: true, title: true },
  });
  if (!deliverable) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Save user message
  const userMessage = await prisma.projectChatMessage.create({
    data: {
      projectId: params.id,
      deliverableId: params.deliverableId,
      role: "user",
      content,
      userId: effectiveUserId,
    },
  });

  // Placeholder AI response
  const assistantMessage = await prisma.projectChatMessage.create({
    data: {
      projectId: params.id,
      deliverableId: params.deliverableId,
      role: "assistant",
      content: `I'm analyzing the "${deliverable.title}" deliverable. AI-powered responses will be available once the reasoning engine is connected to the projects module.`,
      apiCostCents: 0,
    },
  });

  return NextResponse.json(
    { userMessage, assistantMessage },
    { status: 201 },
  );
}
