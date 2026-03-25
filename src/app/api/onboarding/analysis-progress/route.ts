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

  const response: AnalysisProgressResponse = {
    status: analysis.status as AnalysisProgressResponse["status"],
    currentPhase: analysis.currentPhase,
    progressMessages: (analysis.progressMessages as unknown as ProgressMessage[]) || [],
    estimatedMinutesRemaining: estimateMinutesRemaining(analysis.currentPhase),
  };

  // Include synthesis output when available
  if (analysis.status === "confirming" || analysis.status === "complete") {
    response.synthesisOutput = analysis.synthesisOutput as any;
    response.uncertaintyLog = analysis.uncertaintyLog as any;
  }

  return NextResponse.json(response);
}
