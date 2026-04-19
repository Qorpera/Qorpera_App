import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { operatorId } = body;

  if (!operatorId || typeof operatorId !== "string") {
    return NextResponse.json({ error: "operatorId is required" }, { status: 400 });
  }

  const jobId = await enqueueWorkerJob(
    "run_living_research",
    operatorId,
    { operatorId },
  );

  return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const operatorId = req.nextUrl.searchParams.get("operatorId");
  if (!operatorId) {
    return NextResponse.json({ error: "operatorId query param required" }, { status: 400 });
  }

  const [pages, unprocessedChunks, unprocessedSignals, ideaCount] = await Promise.all([
    prisma.knowledgePage.findMany({
      where: { operatorId, scope: "operator" },
      select: { status: true, lastSynthesizedAt: true },
    }),
    prisma.contentChunk.count({
      where: { operatorId, wikiProcessedAt: null },
    }),
    Promise.resolve(0), // ActivitySignal table removed
    prisma.idea.count({
      where: { operatorId },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  let lastSynthesizedAt: Date | null = null;
  for (const p of pages) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    if (!lastSynthesizedAt || p.lastSynthesizedAt > lastSynthesizedAt) {
      lastSynthesizedAt = p.lastSynthesizedAt;
    }
  }

  return NextResponse.json({
    totalPages: pages.length,
    byStatus,
    lastSynthesizedAt: lastSynthesizedAt?.toISOString() ?? null,
    unprocessedChunks,
    unprocessedSignals,
    ideas: ideaCount,
  });
}
