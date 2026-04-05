import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";

/** Resolve a wiki page by slug — tries operator-scoped first, then system-scoped. */
async function resolvePageBySlug(
  slug: string,
  operatorId: string,
  isSuperadmin: boolean,
) {
  // Try operator-scoped page first
  const operatorPage = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug } },
  });
  if (operatorPage) return operatorPage;

  // Try system-scoped page (superadmin can always see; non-superadmin requires intelligenceAccess)
  if (isSuperadmin) {
    return prisma.knowledgePage.findFirst({
      where: { scope: "system", slug },
    });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { intelligenceAccess: true },
  });
  if (operator?.intelligenceAccess) {
    return prisma.knowledgePage.findFirst({
      where: { scope: "system", slug, status: { in: ["verified", "stale"] } },
    });
  }

  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { slug } = await params;
  const isSuperadmin = su.effectiveRole === "superadmin";

  const page = await resolvePageBySlug(slug, operatorId, isSuperadmin);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Resolve source details for citations
  const sources =
    (page.sources as Array<{
      type: string;
      id: string;
      citation: string;
      claimCount: number;
    }>) ?? [];
  const sourceDetails: Array<{
    id: string;
    type: string;
    citation: string;
    claimCount: number;
    preview: string;
    sourceType?: string;
    date?: string;
  }> = [];

  // System pages have no operatorId — skip source resolution for those
  const sourceOperatorId = page.operatorId;
  if (sourceOperatorId) {
    for (const src of sources.slice(0, 30)) {
      try {
        if (src.type === "chunk") {
          const chunk = await prisma.contentChunk.findFirst({
            where: { id: src.id, operatorId: sourceOperatorId },
            select: { content: true, sourceType: true, sourceId: true, createdAt: true },
          });
          if (chunk) {
            sourceDetails.push({
              ...src,
              preview: chunk.content.slice(0, 300),
              sourceType: chunk.sourceType,
              date: chunk.createdAt.toISOString(),
            });
          }
        } else if (src.type === "signal") {
          const signal = await prisma.activitySignal.findFirst({
            where: { id: src.id, operatorId: sourceOperatorId },
            select: { signalType: true, metadata: true, occurredAt: true },
          });
          if (signal) {
            sourceDetails.push({
              ...src,
              preview: `${signal.signalType}: ${JSON.stringify(signal.metadata ?? {}).slice(0, 250)}`,
              sourceType: signal.signalType,
              date: signal.occurredAt.toISOString(),
            });
          }
        }
      } catch {
        sourceDetails.push({ ...src, preview: "[source not found]" });
      }
    }
  }

  // Find pages that cross-reference this one (same scope)
  const refWhere: Record<string, unknown> = {
    crossReferences: { has: page.slug },
  };
  if (page.scope === "system") {
    refWhere.scope = "system";
  } else {
    refWhere.operatorId = operatorId;
    refWhere.scope = "operator";
  }

  const referencedBy = await prisma.knowledgePage.findMany({
    where: refWhere,
    select: { slug: true, title: true, pageType: true },
    take: 20,
  });

  return NextResponse.json({ page, sourceDetails, referencedBy });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;
  const { slug } = await params;
  const isSuperadmin = su.effectiveRole === "superadmin";

  const page = await resolvePageBySlug(slug, operatorId, isSuperadmin);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // System pages can only be edited by superadmin
  if (page.scope === "system" && !isSuperadmin) {
    return NextResponse.json({ error: "System pages can only be edited by superadmin" }, { status: 403 });
  }

  const body = await req.json();
  const { content, status: statusUpdate } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {
    content,
    contentTokens: Math.ceil(content.length / 4),
    status: "verified",
    verifiedAt: new Date(),
    verifiedByModel: "human",
    version: { increment: 1 },
    synthesisPath: "human",
    synthesizedByModel: "human",
    lastSynthesizedAt: new Date(),
    quarantineReason: null,
    staleReason: null,
  };

  // Allow superadmin to set status explicitly (verify/quarantine system pages)
  if (statusUpdate && isSuperadmin && ["verified", "quarantined", "draft"].includes(statusUpdate)) {
    data.status = statusUpdate;
    if (statusUpdate === "quarantined") {
      data.quarantineReason = "Manually quarantined by superadmin";
    }
  }

  const updated = await prisma.knowledgePage.update({
    where: { id: page.id },
    data,
  });

  // Re-embed edited content (fire-and-forget)
  embedChunks([content])
    .then(([embedding]) => {
      if (embedding) {
        const embeddingStr = `[${embedding.join(",")}]`;
        return prisma.$executeRawUnsafe(
          `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
          embeddingStr,
          page.id,
        );
      }
    })
    .catch(() => {});

  return NextResponse.json(updated);
}
