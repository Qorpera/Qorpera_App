import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { slug } = await params;

  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug } },
  });

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

  for (const src of sources.slice(0, 30)) {
    try {
      if (src.type === "chunk") {
        const chunk = await prisma.contentChunk.findFirst({
          where: { id: src.id, operatorId },
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
          where: { id: src.id, operatorId },
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

  // Find pages that cross-reference this one
  const referencedBy = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      crossReferences: { has: page.slug },
    },
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

  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug } },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const updated = await prisma.knowledgePage.update({
    where: { id: page.id },
    data: {
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
    },
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
