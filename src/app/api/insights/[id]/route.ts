import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";
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

  // Scope check for members — operator-scoped insights visible to all
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  if (visibleDomains !== "all" && insight.shareScope !== "operator") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve domain name from wiki page
  let domainName: string | null = null;
  if (insight.domainPageSlug) {
    const page = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: insight.domainPageSlug, scope: "operator" },
      select: { title: true },
    });
    domainName = page?.title ?? null;
  }

  let evidence = null;
  try { evidence = JSON.parse(insight.evidence); } catch {}

  return NextResponse.json({
    id: insight.id,
    domainPageSlug: insight.domainPageSlug ?? null,
    domainName,
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
    targetScope?: "domain" | "operator";
  };

  if (!["promote", "invalidate"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    if (action === "promote") {
      if (!targetScope || !["domain", "operator"].includes(targetScope)) {
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
