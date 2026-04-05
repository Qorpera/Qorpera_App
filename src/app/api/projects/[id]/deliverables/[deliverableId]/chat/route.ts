import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";
import { callLLM, getModel } from "@/lib/ai-provider";
import type { LLMMessage } from "@/lib/ai-provider";
import { searchPages, getSystemWikiPages } from "@/lib/wiki-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const messages = await prisma.projectChatMessage.findMany({
    where: { projectId: params.id, deliverableId: params.deliverableId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; deliverableId: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deliverable = await prisma.projectDeliverable.findFirst({
    where: { id: params.deliverableId, projectId: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      content: true,
      stage: true,
      project: {
        select: {
          name: true,
          description: true,
          operatorId: true,
          knowledgeIndex: true,
          template: { select: { name: true } },
        },
      },
    },
  });
  if (!deliverable) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Save user message
  const userMessage = await prisma.projectChatMessage.create({
    data: {
      projectId: params.id,
      deliverableId: params.deliverableId,
      role: "user",
      content,
      userId: effectiveUserId,
    },
  });

  // Load conversation history (last 50 messages, most recent first then reversed)
  const historyRaw = await prisma.projectChatMessage.findMany({
    where: { projectId: params.id, deliverableId: params.deliverableId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { role: true, content: true },
  });
  const history = historyRaw.reverse();

  // Build wiki context
  const wikiContext = await loadWikiContext(operatorId, deliverable.project.name, deliverable.title);

  // Build system prompt
  const systemPrompt = buildDeliverableChatPrompt({
    projectName: deliverable.project.name,
    projectDescription: deliverable.project.description,
    templateName: deliverable.project.template?.name ?? null,
    deliverableTitle: deliverable.title,
    deliverableDescription: deliverable.description,
    deliverableContent: deliverable.content,
    deliverableStage: deliverable.stage,
    knowledgeIndexSummary: summarizeKnowledgeIndex(deliverable.project.knowledgeIndex),
    wikiContext,
  });

  // Build message array from history
  const messages: LLMMessage[] = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Call LLM
  let assistantContent: string;
  let costCents = 0;
  try {
    const response = await callLLM({
      operatorId,
      instructions: systemPrompt,
      messages,
      model: getModel("projectChat"),
      aiFunction: "copilot",
      temperature: 0.3,
    });
    assistantContent = response.text;
    costCents = response.apiCostCents;
  } catch (err) {
    console.error("[deliverable-chat] LLM call failed:", err);
    assistantContent = "I'm sorry, I encountered an error processing your request. Please try again.";
  }

  // Save assistant response
  const assistantMessage = await prisma.projectChatMessage.create({
    data: {
      projectId: params.id,
      deliverableId: params.deliverableId,
      role: "assistant",
      content: assistantContent,
      apiCostCents: costCents,
    },
  });

  return NextResponse.json(
    { userMessage, assistantMessage },
    { status: 201 },
  );
}

// ── Helpers ──────────────────────────────────────────────

function buildDeliverableChatPrompt(params: {
  projectName: string;
  projectDescription: string | null;
  templateName: string | null;
  deliverableTitle: string;
  deliverableDescription: string | null;
  deliverableContent: unknown | null;
  deliverableStage: string;
  knowledgeIndexSummary: string | null;
  wikiContext: string;
}): string {
  const contentSection = params.deliverableContent
    ? `\nCURRENT CONTENT:\n${formatContentForChat(params.deliverableContent)}`
    : "\nNo content generated yet.";

  const dataRoomSection = params.knowledgeIndexSummary
    ? `\nDATA ROOM SUMMARY:\n${params.knowledgeIndexSummary}\n`
    : "";

  const wikiSection = params.wikiContext
    ? `\nORGANIZATIONAL KNOWLEDGE:\n${params.wikiContext}\n`
    : "";

  return `You are an AI analyst working on the project "${params.projectName}". You are helping the user with the deliverable: "${params.deliverableTitle}".

PROJECT CONTEXT:
${params.projectDescription || "No description provided."}
Template: ${params.templateName || "Custom project"}

DELIVERABLE:
Title: ${params.deliverableTitle}
Description: ${params.deliverableDescription || "No description."}
Stage: ${params.deliverableStage}
${contentSection}
${dataRoomSection}${wikiSection}
You can help the user by:
- Answering questions about the deliverable content and its findings
- Explaining the reasoning behind specific conclusions or risk assessments
- Suggesting areas that need more investigation or data
- Discussing how to interpret findings in the context of the project
- Helping refine or restructure sections of the deliverable

Keep responses focused and professional. Reference specific findings, sources, and data points from the deliverable content when relevant. If the user asks about something not covered in the deliverable, say so clearly rather than speculating.

Respond in the same language the user writes in.`;
}

function formatContentForChat(content: unknown): string {
  const doc = content as { sections?: Array<{ type: string; level?: number; title?: string; text: string; severity?: string }> };
  if (!doc?.sections?.length) return "No content.";

  return doc.sections.map((s) => {
    if (s.type === "heading") return `${"#".repeat(s.level || 1)} ${s.text}`;
    if (s.type === "risk") return `RISK [${s.severity}]: ${s.title}\n${s.text}`;
    if (s.type === "finding") return `FINDING: ${s.title}\n${s.text}`;
    if (s.type === "gap") return `GAP: ${s.title}\n${s.text}`;
    if (s.type === "recommendation") return `RECOMMENDATION: ${s.title}\n${s.text}`;
    return s.text;
  }).join("\n\n");
}

function summarizeKnowledgeIndex(ki: unknown): string | null {
  if (!ki) return null;
  const index = ki as {
    documentCount?: number;
    documents?: Array<{ fileName: string; type: string }>;
    contradictions?: Array<{ description: string }>;
    gaps?: Array<{ description: string }>;
    coverage?: Record<string, string>;
  };

  const lines: string[] = [];
  if (index.documentCount) lines.push(`${index.documentCount} documents in data room.`);
  if (index.documents?.length) {
    lines.push("Documents: " + index.documents.map((d) => `${d.fileName} (${d.type})`).join(", "));
  }
  if (index.contradictions?.length) {
    lines.push(`${index.contradictions.length} contradiction(s) identified.`);
  }
  if (index.gaps?.length) {
    lines.push(`${index.gaps.length} gap(s) identified.`);
  }
  if (index.coverage) {
    const entries = Object.entries(index.coverage);
    const complete = entries.filter(([, v]) => v === "complete").length;
    const partial = entries.filter(([, v]) => v === "partial").length;
    const missing = entries.filter(([, v]) => v === "not_provided").length;
    lines.push(`Coverage: ${complete} complete, ${partial} partial, ${missing} not provided.`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

async function loadWikiContext(
  operatorId: string,
  projectName: string,
  deliverableTitle: string,
): Promise<string> {
  const parts: string[] = [];

  // Operator wiki pages
  try {
    const results = await searchPages(operatorId, `${projectName} ${deliverableTitle}`, { limit: 3 });
    if (results.length > 0) {
      for (const r of results) {
        parts.push(`[${r.pageType}] ${r.title} (confidence: ${r.confidence.toFixed(2)}):\n${r.contentPreview}`);
      }
    }
  } catch (err) {
    console.error("[deliverable-chat] Wiki context load failed:", err);
  }

  // System wiki pages (if operator has access)
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { intelligenceAccess: true },
    });
    if (operator?.intelligenceAccess) {
      const systemPages = await getSystemWikiPages({
        query: `${projectName} ${deliverableTitle}`,
        maxPages: 2,
      });
      for (const p of systemPages) {
        parts.push(`[system: ${p.pageType}] ${p.title} (confidence: ${p.confidence.toFixed(2)}):\n${p.content.slice(0, 500)}`);
      }
    }
  } catch (err) {
    console.error("[deliverable-chat] Wiki context load failed:", err);
  }

  return parts.join("\n\n");
}
