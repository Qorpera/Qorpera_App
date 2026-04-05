/**
 * Agentic deliverable generation engine.
 *
 * Uses the same hypothesis → tool-use → iteration pattern as situation
 * reasoning, but optimized for thoroughness. The agent investigates project
 * documents, the organizational wiki, and entity graph to produce an
 * evidence-based deliverable section.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { runAgenticLoop } from "@/lib/agentic-loop";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { PROJECT_TOOLS, isProjectTool, executeProjectTool } from "@/lib/project-tools";
import { searchPages } from "@/lib/wiki-engine";

// ── Output Schema ──────────────────────────────────────────────────────────

const DeliverableOutputSchema = z.object({
  sections: z.array(z.object({
    type: z.enum(["heading", "paragraph", "finding", "risk", "data_table", "recommendation", "gap"]),
    level: z.number().optional(),
    title: z.string().optional(),
    text: z.string(),
    severity: z.enum(["high", "medium", "low"]).optional(),
    confidence: z.number().optional(),
    sources: z.array(z.string()).optional(),
  })),
  overallConfidence: z.number(),
  coverageAssessment: z.record(z.enum(["complete", "partial", "not_provided"])),
  identifiedRisks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(["high", "medium", "low"]),
    evidence: z.string(),
  })),
  gaps: z.array(z.object({
    area: z.string(),
    description: z.string(),
    impact: z.string(),
  })),
  investigationSummary: z.string(),
});

type DeliverableOutput = z.infer<typeof DeliverableOutputSchema>;

// ── Investigation tools (exclude action/governance tools) ──────────────────

const EXCLUDED_REASONING_TOOLS = new Set([
  "get_available_actions",
  "get_workstream_context",
]);

const INVESTIGATION_TOOLS = REASONING_TOOLS.filter(
  (t) => !EXCLUDED_REASONING_TOOLS.has(t.name),
);

// ── Main ───────────────────────────────────────────────────────────────────

export async function generateDeliverable(
  deliverableId: string,
  projectId: string,
): Promise<void> {
  // 1. Load deliverable + project + template
  const deliverable = await prisma.projectDeliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      title: true,
      description: true,
      stage: true,
      templateSectionId: true,
      project: {
        select: {
          id: true,
          operatorId: true,
          name: true,
          description: true,
          knowledgeIndex: true,
          compilationStatus: true,
          config: true,
          template: {
            select: {
              name: true,
              category: true,
              analysisFramework: true,
              dataExpectations: true,
            },
          },
        },
      },
    },
  });

  if (!deliverable) {
    console.error(`[deliverable-generator] Deliverable not found: ${deliverableId}`);
    return;
  }

  const project = deliverable.project;
  const operatorId = project.operatorId;

  console.log(`[deliverable-generator] Starting generation for "${deliverable.title}" in project "${project.name}"`);

  // 2. Load template analysis framework
  const analysisFramework = project.template?.analysisFramework as
    | Array<{ title: string; description?: string; required?: boolean }>
    | null;

  // 3. Load relevant wiki pages for organizational context
  const wikiPages = await loadWikiContext(operatorId, project.name, deliverable.title);

  // 4. Build system prompt
  const systemPrompt = buildDeliverableSystemPrompt(
    project.template?.name ?? "General Analysis",
    deliverable.title,
  );

  // 5. Build seed context
  const seedContext = buildSeedContext({
    projectName: project.name,
    projectDescription: project.description,
    templateName: project.template?.name ?? null,
    templateCategory: project.template?.category ?? null,
    deliverableTitle: deliverable.title,
    deliverableDescription: deliverable.description,
    analysisFramework,
    knowledgeIndex: project.knowledgeIndex as Record<string, unknown> | null,
    compilationStatus: project.compilationStatus,
    wikiPages,
  });

  // 6. Combine tools
  const allTools = [...PROJECT_TOOLS, ...INVESTIGATION_TOOLS];

  // 7. Build dispatch function
  const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
    if (isProjectTool(toolName)) {
      return executeProjectTool(operatorId, projectId, toolName, args);
    }
    return executeReasoningTool(operatorId, toolName, args);
  };

  // 8. Run agentic loop
  const result = await runAgenticLoop<DeliverableOutput>({
    operatorId,
    contextId: deliverableId,
    contextType: "deliverable",
    cycleNumber: 1,
    systemPrompt,
    seedContext,
    tools: allTools,
    dispatchTool,
    outputSchema: DeliverableOutputSchema,
    softBudget: 50,
    hardBudget: 80,
  });

  console.log(`[deliverable-generator] Complete: ${result.toolCallCount} tool calls, ${result.durationMs}ms, $${(result.apiCostCents / 100).toFixed(2)}`);

  // 9. Determine confidence level
  const confidenceLevel =
    result.output.overallConfidence >= 0.7 ? "high" :
    result.output.overallConfidence >= 0.4 ? "medium" : "low";

  // 10. Store result
  await prisma.projectDeliverable.update({
    where: { id: deliverableId },
    data: {
      content: result.output as unknown as Prisma.InputJsonValue,
      confidenceLevel,
      riskCount: result.output.identifiedRisks.length,
      generationMode: "ai_generated",
    },
  });

  // 11. Create project notification
  const riskSummary = result.output.identifiedRisks.length > 0
    ? ` Found ${result.output.identifiedRisks.length} risk${result.output.identifiedRisks.length > 1 ? "s" : ""} (${result.output.identifiedRisks.filter((r) => r.severity === "high").length} high).`
    : "";
  const gapSummary = result.output.gaps.length > 0
    ? ` ${result.output.gaps.length} data gap${result.output.gaps.length > 1 ? "s" : ""} noted.`
    : "";

  await prisma.projectNotification.create({
    data: {
      projectId,
      type: "deliverable_ready",
      content: `Analysis complete for "${deliverable.title}" (${confidenceLevel} confidence).${riskSummary}${gapSummary}`,
      metadata: { deliverableId, confidenceLevel, riskCount: result.output.identifiedRisks.length },
    },
  });
}

// ── System Prompt ──────────────────────────────────────────────────────────

function buildDeliverableSystemPrompt(
  templateName: string,
  deliverableTitle: string,
): string {
  return `You are a professional analyst conducting a thorough investigation for a ${templateName} project. Your job is to produce a comprehensive, evidence-based deliverable section: "${deliverableTitle}".

Your output must be EXHAUSTIVE. Every claim must be backed by evidence from the data you investigate. Every relevant angle must be explored. Missing something important is worse than taking extra time.

INVESTIGATION APPROACH:
1. Start by reading the knowledge index (get_knowledge_index) to understand what data is available.
2. Form hypotheses about what this deliverable section should cover based on the template requirements.
3. Systematically investigate each hypothesis using project documents AND organizational wiki knowledge.
4. For each finding, trace it to specific source data. Cross-reference across multiple documents.
5. Identify contradictions, gaps, and risks as you go.
6. When you've covered all required areas AND followed all evidence chains to conclusion, produce your output.

THOROUGHNESS REQUIREMENTS:
- You have a large tool call budget. USE IT. 50+ tool calls is normal and expected.
- Read every relevant document, not just search snippets.
- Cross-reference findings across multiple sources.
- If the knowledge index shows contradictions, investigate both sides.
- If a gap exists, explicitly note it rather than skipping it.
- Check the organizational wiki for context that the project documents might not contain (entity relationships, historical patterns, communication context).

WHAT COUNTS AS A FINDING:
- A specific, evidence-backed conclusion with source citations
- NOT a restatement of what a document says — your analysis of what it means
- Include the "so what" — why does this finding matter for the project

RISK IDENTIFICATION:
- Flag anything where evidence is contradictory, incomplete, or concerning
- Distinguish between data quality risks and business risks
- Severity: high = could change the project conclusion, medium = needs attention, low = minor note

OUTPUT FORMAT:
Produce a single JSON object matching the required schema. Structure your sections logically with headings, paragraphs, findings, risks, recommendations, and gap notes. Use source citations in the "sources" array to reference specific documents and chunks.`;
}

// ── Seed Context ───────────────────────────────────────────────────────────

function buildSeedContext(params: {
  projectName: string;
  projectDescription: string | null;
  templateName: string | null;
  templateCategory: string | null;
  deliverableTitle: string;
  deliverableDescription: string | null;
  analysisFramework: Array<{ title: string; description?: string; required?: boolean }> | null;
  knowledgeIndex: Record<string, unknown> | null;
  compilationStatus: string | null;
  wikiPages: string[];
}): string {
  const parts: string[] = [];

  // Project overview
  parts.push(`PROJECT: ${params.projectName}`);
  if (params.projectDescription) parts.push(`Description: ${params.projectDescription}`);
  if (params.templateName) parts.push(`Template: ${params.templateName} (${params.templateCategory ?? "general"})`);
  parts.push("");

  // Deliverable requirements
  parts.push(`DELIVERABLE: ${params.deliverableTitle}`);
  if (params.deliverableDescription) parts.push(`Description: ${params.deliverableDescription}`);
  parts.push("");

  // Analysis framework sections
  if (params.analysisFramework && params.analysisFramework.length > 0) {
    parts.push("TEMPLATE ANALYSIS FRAMEWORK (sections this deliverable should address):");
    for (const section of params.analysisFramework) {
      const required = section.required !== false ? " [required]" : " [optional]";
      parts.push(`  - ${section.title}${required}${section.description ? `: ${section.description}` : ""}`);
    }
    parts.push("");
  }

  // Knowledge index summary
  if (params.knowledgeIndex) {
    parts.push("KNOWLEDGE INDEX STATUS: Compiled. Use get_knowledge_index to read the full index.");
    const idx = params.knowledgeIndex as Record<string, unknown>;
    if (idx.documentCount) parts.push(`  Documents indexed: ${idx.documentCount}`);
    if (Array.isArray(idx.contradictions) && idx.contradictions.length > 0) {
      parts.push(`  Contradictions found: ${idx.contradictions.length} — investigate these carefully`);
    }
    if (Array.isArray(idx.gaps) && idx.gaps.length > 0) {
      parts.push(`  Known gaps: ${idx.gaps.length}`);
    }
  } else if (params.compilationStatus === "compiling") {
    parts.push("KNOWLEDGE INDEX STATUS: Currently compiling. Use list_project_documents and search_project_documents directly.");
  } else {
    parts.push("KNOWLEDGE INDEX STATUS: Not compiled. Use list_project_documents to discover available data.");
  }
  parts.push("");

  // Available tools summary
  parts.push("AVAILABLE DATA SOURCES:");
  parts.push("  - Project documents: Use list_project_documents, search_project_documents, read_document_full");
  parts.push("  - Knowledge index: Use get_knowledge_index for compiled overview");
  parts.push("  - Entity graph: Use lookup_entity, search_entities, search_around");
  parts.push("  - Communications: Use search_communications for email/Slack/Teams content");
  parts.push("  - Documents (org-wide): Use search_documents for uploaded docs and Drive files");
  parts.push("  - Organizational wiki: Use search_wiki, read_wiki_page for synthesized knowledge");
  parts.push("  - Activity history: Use get_activity_timeline for behavioral patterns");
  parts.push("");

  // Wiki context
  if (params.wikiPages.length > 0) {
    parts.push("RELEVANT WIKI PAGES (organizational context):");
    for (const page of params.wikiPages) {
      parts.push(page);
    }
    parts.push("");
  }

  parts.push("Begin your investigation. Start with get_knowledge_index or list_project_documents to understand what data is available.");

  return parts.join("\n");
}

// ── Wiki Context Loader ────────────────────────────────────────────────────

async function loadWikiContext(
  operatorId: string,
  projectName: string,
  deliverableTitle: string,
): Promise<string[]> {
  try {
    const results = await searchPages(operatorId, `${projectName} ${deliverableTitle}`, { limit: 5 });
    return results.map((r) =>
      `  - ${r.title} [${r.pageType}] (slug: ${r.slug}, confidence: ${r.confidence.toFixed(2)})`,
    );
  } catch {
    return [];
  }
}
