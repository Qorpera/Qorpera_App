import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estimateMinutesRemaining } from "@/lib/onboarding-intelligence/progress";
import type { AnalysisProgressResponse, ProgressMessage } from "@/lib/onboarding-intelligence/types";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { operatorId: session.operatorId },
  });

  if (!analysis) {
    return NextResponse.json({ error: "No analysis found" }, { status: 404 });
  }

  // Worker availability detection
  if (analysis.status === "pending" && !analysis.workerClaimedAt) {
    const pendingSince = analysis.createdAt.getTime();
    const now = Date.now();
    const pendingMinutes = (now - pendingSince) / 60000;

    if (pendingMinutes > 10) {
      return NextResponse.json({
        status: "worker_unavailable",
        message: "The analysis service is temporarily unavailable. Please try again later.",
        progressMessages: [],
      });
    } else if (pendingMinutes > 2) {
      return NextResponse.json({
        status: "waiting_for_worker",
        message: "Analysis queued — processing will begin shortly.",
        progressMessages: [],
      });
    }
  }

  const chunkCount = await prisma.contentChunk.count({ where: { operatorId: session.operatorId } });

  const response: AnalysisProgressResponse = {
    status: analysis.status as AnalysisProgressResponse["status"],
    currentPhase: analysis.currentPhase,
    progressMessages: (analysis.progressMessages as unknown as ProgressMessage[]) || [],
    estimatedMinutesRemaining: estimateMinutesRemaining(analysis.currentPhase),
    contentChunkCount: chunkCount,
  };

  // Include real entity/situation counts from database
  if (analysis.status === "confirming" || analysis.status === "complete") {
    const [situationCount, entityCount, relationshipCount, pipelineJob, wikiStatsResult, initiativeCount] = await Promise.all([
      prisma.situation.count({
        where: { operatorId: session.operatorId, status: { in: ["detected", "reasoning", "proposed"] } },
      }),
      prisma.entity.count({
        where: { operatorId: session.operatorId, status: "active", category: { in: ["digital", "external"] } },
      }),
      prisma.relationship.count({
        where: { fromEntity: { operatorId: session.operatorId } },
      }),
      prisma.workerJob.findFirst({
        where: { operatorId: session.operatorId, jobType: "post_synthesis_pipeline" },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      }),
      prisma.knowledgePage.groupBy({
        by: ["pageType", "status"],
        where: { operatorId: session.operatorId, scope: "operator", projectId: null },
        _count: true,
        _avg: { confidence: true },
      }),
      prisma.initiative.count({
        where: { operatorId: session.operatorId, status: { notIn: ["completed", "rejected", "failed"] } },
      }),
    ]);

    response.situationCount = situationCount;
    response.entityCount = entityCount;
    response.relationshipCount = relationshipCount;
    response.postSynthesisStatus = pipelineJob?.status ?? null;

    // Build wiki stats from groupBy result
    const wikiPages = wikiStatsResult.reduce((sum, g) => sum + g._count, 0);
    const wikiVerified = wikiStatsResult.filter(g => g.status === "verified").reduce((sum, g) => sum + g._count, 0);
    const wikiByType: Record<string, number> = {};
    for (const g of wikiStatsResult) {
      wikiByType[g.pageType] = (wikiByType[g.pageType] ?? 0) + g._count;
    }
    const avgConfidence = wikiPages > 0
      ? wikiStatsResult.reduce((sum, g) => sum + (g._avg?.confidence ?? 0) * g._count, 0) / wikiPages
      : 0;

    response.wikiStats = {
      totalPages: wikiPages,
      verifiedPages: wikiVerified,
      byType: wikiByType,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
    };
    response.initiativeCount = initiativeCount;
  }

  // Include synthesis output when available — transform CompanyModel to UI shape
  if (analysis.status === "confirming" || analysis.status === "complete") {
    const raw = analysis.synthesisOutput as Record<string, unknown> | null;
    if (raw) {
      const departments = (raw.departments as Array<Record<string, unknown>> ?? []).map((d) => ({
        name: d.name as string,
        headCount: ((raw.people as Array<Record<string, unknown>> ?? []).filter((p) => p.primaryDepartment === d.name)).length,
        keyPeople: ((raw.people as Array<Record<string, unknown>> ?? []).filter((p) => p.primaryDepartment === d.name && (p.roleLevel === "c_level" || p.roleLevel === "manager" || p.roleLevel === "lead" || p.roleLevel === "director"))).map((p) => p.displayName as string),
        functions: d.description ? [d.description as string] : [],
      }));
      const people = (raw.people as Array<Record<string, unknown>> ?? []).map((p) => ({
        name: (p.displayName as string) ?? "",
        email: p.email as string | undefined,
        department: p.primaryDepartment as string | undefined,
        role: p.role as string | undefined,
        relationships: p.reportsToEmail ? [`reports to ${p.reportsToEmail}`] : [],
      }));
      const situationRecommendations = (raw.situationTypeRecommendations as Array<Record<string, unknown>> ?? []).map((s) => ({
        name: s.name as string,
        description: s.description as string,
        department: s.department as string | undefined,
        priority: (s.severity as string ?? "medium") as "high" | "medium" | "low",
      }));
      const relationships = (raw.keyRelationships as Array<Record<string, unknown>> ?? []).map((r) => ({
        from: (r.primaryInternalContact as string) ?? "",
        to: (r.contactName as string) ?? "",
        type: (r.type as string) ?? "customer",
        strength: r.healthScore === "critical" || r.healthScore === "at_risk" ? "weak" as const : r.healthScore === "cold" ? "moderate" as const : "strong" as const,
      }));
      const knowledgeInventory: Array<{ topic: string; sources: string[]; coverage: string }> = [];
      const processes = (raw.processes as Array<Record<string, unknown>> ?? []).map((proc) => ({
        name: proc.name as string,
        department: proc.department as string | undefined,
        description: proc.description as string,
        tools: [],
      }));
      response.synthesisOutput = { departments, people, processes, relationships, knowledgeInventory, situationRecommendations } as any;
    }
    response.uncertaintyLog = (raw?.uncertaintyLog ?? analysis.uncertaintyLog) as any;
  }

  return NextResponse.json(response);
}
