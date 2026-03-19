import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { promoteInsight, invalidateInsight } from "@/lib/knowledge-transfer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const insight = await prisma.operationalInsight.findFirst({
    where: { id, operatorId },
  });
  if (!insight) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope check for members
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all") {
    if (insight.shareScope === "personal") {
      const aiEntity = await prisma.entity.findFirst({
        where: { operatorId, ownerUserId: user.id, entityType: { slug: "ai-agent" } },
        select: { id: true },
      });
      if (!aiEntity || aiEntity.id !== insight.aiEntityId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else if (insight.shareScope === "department" && insight.departmentId) {
      if (!visibleDepts.includes(insight.departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
  }

  // Resolve AI entity name
  const aiEntity = await prisma.entity.findUnique({
    where: { id: insight.aiEntityId },
    select: { displayName: true },
  });

  let evidence = null;
  try { evidence = JSON.parse(insight.evidence); } catch {}

  return NextResponse.json({
    id: insight.id,
    aiEntityId: insight.aiEntityId,
    aiEntityName: aiEntity?.displayName ?? null,
    departmentId: insight.departmentId,
    insightType: insight.insightType,
    description: insight.description,
    evidence,
    confidence: insight.confidence,
    promptModification: insight.promptModification,
    shareScope: insight.shareScope,
    status: insight.status,
    createdAt: insight.createdAt.toISOString(),
    updatedAt: insight.updatedAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const insight = await prisma.operationalInsight.findFirst({
    where: { id, operatorId },
  });
  if (!insight) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { action, targetScope } = body as {
    action: "promote" | "invalidate";
    targetScope?: "department" | "operator";
  };

  if (!["promote", "invalidate"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    if (action === "promote") {
      if (!targetScope || !["department", "operator"].includes(targetScope)) {
        return NextResponse.json({ error: "targetScope required for promote" }, { status: 400 });
      }
      await promoteInsight(id, targetScope, user.id);
    } else {
      await invalidateInsight(id, user.id);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const updated = await prisma.operationalInsight.findUnique({ where: { id } });

  let evidence = null;
  try { evidence = JSON.parse(updated!.evidence); } catch {}

  return NextResponse.json({
    id: updated!.id,
    insightType: updated!.insightType,
    description: updated!.description,
    evidence,
    confidence: updated!.confidence,
    promptModification: updated!.promptModification,
    shareScope: updated!.shareScope,
    status: updated!.status,
  });
}
