/**
 * Project knowledge compilation.
 *
 * Reads all document summaries for a project and compiles them into a structured
 * Knowledge Index via LLM — document inventory, entities, cross-references,
 * contradictions, gaps, and coverage assessment.
 *
 * Stored as JSON in Project.knowledgeIndex.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

const MAX_COMPILATION_TOKENS = 150_000;

export async function compileProjectKnowledge(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      template: { select: { analysisFramework: true, dataExpectations: true, name: true } },
    },
  });

  if (!project) {
    console.error(`[project-compilation] Project not found: ${projectId}`);
    return;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { compilationStatus: "compiling" },
  });

  try {
    // Load all project documents
    const documents = await prisma.internalDocument.findMany({
      where: { projectId, operatorId: project.operatorId },
      select: { id: true, fileName: true, mimeType: true, rawText: true, embeddingStatus: true, createdAt: true },
    });

    if (documents.length === 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: { compilationStatus: "error" },
      });
      console.error(`[project-compilation] No documents for project ${projectId}`);
      return;
    }

    // Load document summary chunks (chunkIndex 0 = summary created by content pipeline)
    const summaryChunks = await prisma.contentChunk.findMany({
      where: {
        projectId,
        operatorId: project.operatorId,
        chunkIndex: 0,
      },
      select: { id: true, sourceId: true, content: true, tokenCount: true, metadata: true },
      orderBy: { createdAt: "asc" },
    });

    // Build file name lookup from documents
    const docNameMap = new Map(documents.map((d) => [d.id, { fileName: d.fileName, mimeType: d.mimeType }]));

    // Estimate total tokens and truncate if needed
    let totalTokens = 0;
    const usableChunks: typeof summaryChunks = [];
    for (const chunk of summaryChunks) {
      const tokens = chunk.tokenCount ?? 0;
      if (totalTokens + tokens > MAX_COMPILATION_TOKENS) {
        console.warn(
          `[project-compilation] Truncating at ${usableChunks.length}/${summaryChunks.length} summaries ` +
          `(${totalTokens} tokens, limit ${MAX_COMPILATION_TOKENS})`,
        );
        break;
      }
      totalTokens += tokens;
      usableChunks.push(chunk);
    }

    // Build template context
    const template = project.template;
    const templateName = template?.name ?? "General";
    const dataExpectations = template?.dataExpectations as Record<string, unknown> | null;
    const analysisFramework = template?.analysisFramework as { sections?: { title: string }[] } | null;

    let templateContext = "";
    if (dataExpectations) {
      templateContext += `\nExpected data categories: ${JSON.stringify(dataExpectations)}`;
    }
    if (analysisFramework?.sections?.length) {
      templateContext += `\nAnalysis framework sections: ${analysisFramework.sections.map((s) => s.title).join(", ")}`;
    }

    // System prompt
    const systemPrompt = `You are a knowledge compiler for a professional services project. You have been given summaries of all documents uploaded to a project data room. Your job is to produce a structured Knowledge Index — a compiled understanding of what's in the data.

Project: ${project.name}
Project type: ${templateName}
${templateContext}

Instructions:
1. Document Inventory — list every document with its type (financial statement, contract, email, report, etc.), the time period it covers, and key entities mentioned.
2. Entity Extraction — identify all companies, people, contracts, and key financial metrics. Note which document each comes from.
3. Cross-References — identify where documents reference each other (e.g., a contract referenced in an email, revenue figures that appear in multiple documents).
4. Contradictions — flag any cases where the same metric or fact appears differently across documents. Include the specific values and sources.
5. Gaps — identify information that is referenced but not found in the uploads, or expected data categories with no coverage.
6. Coverage Assessment — for each expected data category (if any), rate coverage as "complete", "partial", or "not_provided".

Respond with valid JSON only, no markdown fencing. Use this schema:
{
  "documentCount": number,
  "totalTokens": number,
  "documents": [
    { "sourceId": string, "fileName": string, "type": string, "period": string | null, "entities": string[], "keyMetrics": Record<string, string>, "summary": string }
  ],
  "entities": [
    { "name": string, "type": "company" | "person" | "contract" | "metric", "role": string, "mentionedIn": string[] }
  ],
  "crossReferences": [
    { "from": string, "to": string, "relationship": string }
  ],
  "contradictions": [
    { "description": string, "sources": string[], "values": Record<string, string>, "severity": "high" | "medium" | "low" }
  ],
  "gaps": [
    { "description": string, "reference": string | null, "category": string }
  ],
  "coverage": Record<string, "complete" | "partial" | "not_provided">,
  "compiledAt": string
}`;

    // User message from document summaries
    const docSections = usableChunks.map((chunk) => {
      const doc = docNameMap.get(chunk.sourceId);
      const fileName = doc?.fileName ?? "Unknown";
      const mimeType = doc?.mimeType ?? "unknown";
      return `---\nDOCUMENT: ${fileName} (${mimeType})\nSOURCE ID: ${chunk.sourceId}\n${chunk.content}\n---`;
    });

    const userMessage = `Here are the summaries of all ${usableChunks.length} documents in the project data room:\n\n${docSections.join("\n\n")}`;

    // Call LLM
    const response = await callLLM({
      operatorId: project.operatorId,
      model: getModel("projectCompilation"),
      instructions: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 8000,
      temperature: 0,
    });

    // Parse response
    const parsedIndex = extractJSON(response.text);
    if (!parsedIndex) {
      console.error(`[project-compilation] Failed to parse JSON from LLM response for project ${projectId}`);
      await prisma.project.update({
        where: { id: projectId },
        data: { compilationStatus: "error" },
      });
      return;
    }

    // Store result
    await prisma.project.update({
      where: { id: projectId },
      data: {
        knowledgeIndex: parsedIndex as unknown as Prisma.InputJsonValue,
        compilationStatus: "compiled",
        compiledAt: new Date(),
      },
    });

    const docCount = (parsedIndex as Record<string, unknown>).documentCount ?? usableChunks.length;
    console.log(
      `[project-compilation] Compiled project "${project.name}" (${projectId}): ${docCount} documents, cost: $${(response.apiCostCents / 100).toFixed(2)}`,
    );
  } catch (err) {
    console.error(`[project-compilation] Failed for project ${projectId}:`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { compilationStatus: "error" },
    });
  }
}
