/**
 * Progress message helpers for onboarding intelligence analysis.
 * Messages are polled by the UI to show real-time analysis status.
 */

import { prisma } from "@/lib/db";
import type { ProgressMessage } from "./types";

/**
 * Append a progress message to the analysis's progressMessages array.
 */
export async function addProgressMessage(
  analysisId: string,
  message: string,
  agentName?: string,
): Promise<void> {
  const entry: ProgressMessage = {
    timestamp: new Date().toISOString(),
    message,
    agentName,
  };

  // Atomic JSON array append — avoids read-modify-write race when
  // multiple agents complete simultaneously.
  // Called only from the worker pipeline — analysisId is trusted, not user-supplied.
  await prisma.$executeRaw`
    UPDATE "OnboardingAnalysis"
    SET "progressMessages" = "progressMessages" || ${JSON.stringify(entry)}::jsonb,
        "updatedAt" = NOW()
    WHERE id = ${analysisId}
  `;
}

/**
 * Estimate minutes remaining based on current phase.
 */
export function estimateMinutesRemaining(currentPhase: string): number | undefined {
  const estimates: Record<string, number> = {
    people_discovery: 4,
    evidence_extraction: 10,
    wiki_findings: 8,
    wiki_synthesis: 15,
    synthesis: 3, // legacy
  };
  return estimates[currentPhase];
}
