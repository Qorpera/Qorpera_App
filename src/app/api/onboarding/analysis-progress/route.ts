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
