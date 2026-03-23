import { prisma } from "@/lib/db";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { triggerNextIteration } from "@/lib/internal-api";

/**
 * GET /api/cron/recover-stuck-agents
 *
 * Runs every 5 minutes. Recovers onboarding agent runs that silently stalled
 * (e.g., cold start timeout, network blip during self-chain fetch).
 *
 * 1. Agents stuck > 20 min in "running" → re-trigger iteration
 * 2. Analyses stuck > 2 hours in "analyzing" → force-fail
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);

  // 1. Find stuck agent runs: running + lastIterationAt stale + parent analysis active
  const stuckRuns = await prisma.onboardingAgentRun.findMany({
    where: {
      status: "running",
      lastIterationAt: { lt: twentyMinAgo },
      analysis: { status: "analyzing" },
    },
  });

  let recovered = 0;
  for (const run of stuckRuns) {
    try {
      await addProgressMessage(
        run.analysisId,
        `Re-triggering ${run.agentName} (iteration ${run.iterationCount}) after connection interruption...`,
        "system",
      );
      await triggerNextIteration(run.id);
      recovered++;
    } catch (err) {
      console.error(`Failed to recover agent run ${run.id}:`, err);
    }
  }

  // 2. Analyses stuck > 2 hours → force-fail
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const stuckAnalyses = await prisma.onboardingAnalysis.findMany({
    where: {
      status: "analyzing",
      startedAt: { lt: twoHoursAgo },
    },
  });

  for (const analysis of stuckAnalyses) {
    await prisma.onboardingAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "failed",
        failureReason: "Analysis timed out after 2 hours. Please retry.",
      },
    });

    await prisma.onboardingAgentRun.updateMany({
      where: { analysisId: analysis.id, status: "running" },
      data: { status: "failed" },
    });

    await addProgressMessage(
      analysis.id,
      "Analysis timed out. Please try again — click Retry below.",
      "system",
    );
  }

  return Response.json({ recovered, timedOut: stuckAnalyses.length });
}
