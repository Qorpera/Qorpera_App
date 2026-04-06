/**
 * Deliverable completeness assessment.
 *
 * After generation: extract completeness from the generator's structured output (free — no LLM call).
 * After manual edit: re-assess with a lightweight LLM call (Sonnet — needs framework judgment).
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

// ── Types ────────────────────────────────────────────────────

interface CompletenessReport {
  overallCompleteness: number; // 0.0 – 1.0
  sections: Array<{
    templateSection: string;
    status: "complete" | "partial" | "not_provided";
    coverage: number; // 0.0 – 1.0
    gaps: string[];
    dataAvailable: boolean;
  }>;
  criticalGaps: string[];
  suggestedActions: string[];
  assessedAt: string;
  assessmentMethod: "extraction" | "reassessment";
}

// ── Extract from generator output (no LLM call) ─────────────

/**
 * Extracts a completeness report from the deliverable generator's structured output.
 * Call this right after generation — it's free (just data transformation).
 */
export async function extractCompletenessFromOutput(deliverableId: string): Promise<void> {
  const deliverable = await prisma.projectDeliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      content: true,
      project: {
        select: {
          template: {
            select: { analysisFramework: true },
          },
        },
      },
    },
  });

  if (!deliverable?.content) return;

  const content = deliverable.content as Record<string, unknown>;
  const framework = deliverable.project?.template?.analysisFramework as
    | Array<{ title: string; description?: string; required?: boolean }>
    | null;

  const coverageAssessment = (content.coverageAssessment ?? {}) as Record<string, string>;
  const gaps = (content.gaps ?? []) as Array<{ area: string; description: string; impact: string }>;
  const overallConfidence = (content.overallConfidence ?? 0.5) as number;

  // Build per-section report from framework + coverage assessment
  const sections: CompletenessReport["sections"] = [];

  if (framework && framework.length > 0) {
    for (const section of framework) {
      const sectionStatus = coverageAssessment[section.title] as "complete" | "partial" | "not_provided" | undefined;
      const sectionGaps = gaps
        .filter(g => g.area.toLowerCase().includes(section.title.toLowerCase()) || section.title.toLowerCase().includes(g.area.toLowerCase()))
        .map(g => g.description);

      const status = sectionStatus ?? "not_provided";
      const coverage = status === "complete" ? 1.0 : status === "partial" ? 0.5 : 0.0;

      sections.push({
        templateSection: section.title,
        status,
        coverage,
        gaps: sectionGaps,
        dataAvailable: status !== "not_provided",
      });
    }
  } else {
    // No template framework — use coverage assessment keys directly
    for (const [key, value] of Object.entries(coverageAssessment)) {
      const status = value as "complete" | "partial" | "not_provided";
      sections.push({
        templateSection: key,
        status,
        coverage: status === "complete" ? 1.0 : status === "partial" ? 0.5 : 0.0,
        gaps: [],
        dataAvailable: status !== "not_provided",
      });
    }
  }

  // Calculate overall completeness from sections
  const overallCompleteness = sections.length > 0
    ? sections.reduce((sum, s) => sum + s.coverage, 0) / sections.length
    : overallConfidence;

  const criticalGaps = gaps
    .filter(g => g.impact.toLowerCase().includes("critical") || g.impact.toLowerCase().includes("significant") || g.impact.toLowerCase().includes("major"))
    .map(g => `${g.area}: ${g.description}`);

  // Generate suggested actions from gaps
  const suggestedActions = gaps.slice(0, 5).map(g => {
    if (g.area.toLowerCase().includes("financial")) return `Upload financial statements covering ${g.area}`;
    if (g.area.toLowerCase().includes("contract")) return `Upload contracts related to ${g.area}`;
    if (g.area.toLowerCase().includes("legal")) return `Request legal documentation for ${g.area}`;
    return `Provide additional data for: ${g.area}`;
  });

  const report: CompletenessReport = {
    overallCompleteness,
    sections,
    criticalGaps,
    suggestedActions,
    assessedAt: new Date().toISOString(),
    assessmentMethod: "extraction",
  };

  const confidenceLevel = overallCompleteness >= 0.7 ? "high" : overallCompleteness >= 0.4 ? "medium" : "low";

  await prisma.projectDeliverable.update({
    where: { id: deliverableId },
    data: {
      completenessReport: report as any,
      confidenceLevel,
    },
  });
}

// ── Re-assess after edits (LLM call) ────────────────────────

/**
 * Re-assesses completeness after manual edits to deliverable content.
 * Uses Sonnet for judgment quality — needs to understand whether edited content
 * adequately covers template requirements.
 */
export async function reassessCompleteness(deliverableId: string): Promise<void> {
  const deliverable = await prisma.projectDeliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      title: true,
      content: true,
      project: {
        select: {
          name: true,
          operatorId: true,
          template: {
            select: { name: true, category: true, analysisFramework: true },
          },
        },
      },
    },
  });

  if (!deliverable?.content || !deliverable.project) return;

  const content = deliverable.content as Record<string, unknown>;
  const framework = deliverable.project.template?.analysisFramework as
    | Array<{ title: string; description?: string; required?: boolean }>
    | null;

  if (!framework || framework.length === 0) {
    // No template framework — fall back to extraction
    await extractCompletenessFromOutput(deliverableId);
    return;
  }

  // Extract narrative content from sections
  const contentSections = (content.sections ?? []) as Array<{ type: string; title?: string; text: string }>;
  const narrativeContent = contentSections
    .filter(s => s.type !== "heading")
    .map(s => `${s.title ? `**${s.title}**: ` : ""}${s.text}`)
    .join("\n\n")
    .slice(0, 8000);

  const model = getModel("deliverableCompleteness");

  const response = await callLLM({
    instructions: `You are assessing the completeness of a deliverable section against its template requirements.

For each required section in the template framework, determine:
1. Whether the deliverable content adequately covers it (complete/partial/not_provided)
2. Coverage score (0.0-1.0)
3. Specific gaps if any
4. Whether relevant data appears to be available

Also identify critical gaps and suggest concrete actions to fill them.

Respond with ONLY valid JSON matching this schema:
{
  "sections": [
    {
      "templateSection": "section title from framework",
      "status": "complete" | "partial" | "not_provided",
      "coverage": 0.0-1.0,
      "gaps": ["specific gap descriptions"],
      "dataAvailable": true/false
    }
  ],
  "criticalGaps": ["gaps that could change the project conclusion"],
  "suggestedActions": ["concrete actions like 'Upload Q3 cash flow statements'"]
}`,
    messages: [{
      role: "user",
      content: `## Template: ${deliverable.project.template?.name ?? "General"} (${deliverable.project.template?.category ?? "general"})

## Required sections:
${framework.map(s => `- ${s.title}${s.required !== false ? " [required]" : " [optional]"}${s.description ? `: ${s.description}` : ""}`).join("\n")}

## Deliverable: "${deliverable.title}"

## Current content:
${narrativeContent}

Assess completeness:`,
    }],
    temperature: 0.1,
    maxTokens: 2000,
    aiFunction: "reasoning",
    operatorId: deliverable.project.operatorId,
    model,
  });

  const parsed = extractJSON(response.text);
  if (!parsed) {
    console.error("[deliverable-completeness] Failed to parse reassessment response");
    return;
  }

  const sectionResults = (parsed.sections ?? []) as CompletenessReport["sections"];
  const overallCompleteness = sectionResults.length > 0
    ? sectionResults.reduce((sum, s) => sum + (s.coverage ?? 0), 0) / sectionResults.length
    : 0.5;

  const report: CompletenessReport = {
    overallCompleteness,
    sections: sectionResults,
    criticalGaps: (parsed.criticalGaps ?? []) as string[],
    suggestedActions: (parsed.suggestedActions ?? []) as string[],
    assessedAt: new Date().toISOString(),
    assessmentMethod: "reassessment",
  };

  const confidenceLevel = overallCompleteness >= 0.7 ? "high" : overallCompleteness >= 0.4 ? "medium" : "low";

  await prisma.projectDeliverable.update({
    where: { id: deliverableId },
    data: {
      completenessReport: report as any,
      confidenceLevel,
    },
  });
}
