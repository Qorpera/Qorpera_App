/**
 * Situation Wiki Page Helpers
 *
 * Creates and updates situation_instance wiki pages.
 * Detection pipeline creates initial pages (trigger + context).
 * Reasoning engine writes completed pages (investigation + action plan).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { embedTexts } from "@/lib/wiki-embedder";
import { extractCrossReferences } from "@/lib/wiki-engine";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SituationProperties {
  situation_id: string;   // CUID — shared with thin Situation record
  status: "detected" | "reasoning" | "proposed" | "approved" | "executing" | "monitoring" | "resolved" | "rejected";
  severity: number;       // 0–1
  confidence: number;     // 0–1
  situation_type: string; // slug of parent situation_type page
  detected_at: string;    // ISO datetime
  source: "detected" | "manual" | "retrospective";
  trigger_ref?: string;   // RawContent ID
  assigned_to?: string;   // person page slug
  domain?: string;        // domain hub page slug
  resolved_at?: string;   // ISO datetime
  current_step?: number;  // 1-indexed
  autonomy_level?: "supervised" | "notify" | "autonomous";
  cycle_number?: number;
  outcome?: "positive" | "negative" | "neutral";
  after_batch?: "resolve" | "re_evaluate" | "monitor";
  resolution_type?: "self_resolving" | "response_dependent" | "informational";
  monitoring_criteria?: {
    waitingFor: string;
    expectedWithinDays: number;
    followUpAction: string;
  };
  total_executions?: number;
}

export interface CreateSituationPageParams {
  operatorId: string;
  slug: string;
  title: string;
  properties: SituationProperties;
  triggerContent: string;     // The trigger section content (what happened, source ref)
  contextContent: string;     // Initial context section (cross-refs, key facts)
  timelineEntries: string[];  // Initial timeline entries (e.g. "2026-04-12 14:32 — Detected: ...")
}

export interface UpdateSituationPageParams {
  operatorId: string;
  slug: string;
  title: string;
  properties: SituationProperties;
  articleBody: string;        // Complete article body (all sections from ## Trigger onward)
  synthesizedByModel: string;
  synthesisCostCents?: number;
  synthesisDurationMs?: number;
}

// ── Property Table Rendering ─────────────────────────────────────────────────

/**
 * Render properties as a markdown table for LLM readability.
 * This appears at the top of the page content, below the title.
 * The JSONB `properties` column is the queryable source of truth —
 * this table is for when LLMs or humans read the page.
 */
export function renderPropertyTable(props: SituationProperties): string {
  const lines = [
    "| Property | Value |",
    "|---|---|",
  ];

  if (props.situation_id) lines.push(`| ID | ${props.situation_id} |`);

  const STATUS_DISPLAY: Record<string, string> = {
    detected: "Detected", reasoning: "Reasoning", proposed: "Proposed",
    approved: "Approved", executing: "Executing", monitoring: "Monitoring",
    resolved: "Resolved", rejected: "Rejected",
  };

  lines.push(`| Status | ${STATUS_DISPLAY[props.status] ?? props.status} |`);
  lines.push(`| Severity | ${props.severity.toFixed(2)} |`);
  lines.push(`| Confidence | ${props.confidence.toFixed(2)} |`);
  lines.push(`| Situation Type | [[${props.situation_type}]] |`);
  if (props.assigned_to) lines.push(`| Assigned To | [[${props.assigned_to}]] |`);
  if (props.domain) lines.push(`| Domain | [[${props.domain}]] |`);
  lines.push(`| Detected | ${formatDate(props.detected_at)} |`);
  if (props.resolved_at) lines.push(`| Resolved | ${formatDate(props.resolved_at)} |`);
  lines.push(`| Source | ${capitalize(props.source)} |`);
  if (props.current_step != null) lines.push(`| Current Step | ${props.current_step} |`);
  if (props.autonomy_level) lines.push(`| Autonomy | ${capitalize(props.autonomy_level)} |`);
  if (props.cycle_number && props.cycle_number > 1) lines.push(`| Cycle | ${props.cycle_number} |`);
  if (props.outcome) lines.push(`| Outcome | ${capitalize(props.outcome)} |`);
  if (props.status === "monitoring" && props.monitoring_criteria) {
    lines.push(`| Monitoring | ${props.monitoring_criteria.waitingFor} |`);
  }

  return lines.join("\n");
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Page Content Assembly ────────────────────────────────────────────────────

/**
 * Build the full page content from title + properties + article body.
 * Used by both create and update paths.
 */
export function assemblePageContent(title: string, props: SituationProperties, articleBody: string): string {
  return `# ${title}\n\n${renderPropertyTable(props)}\n\n${articleBody}`;
}

/**
 * Build the initial article body for a newly detected situation.
 * Contains: Trigger, initial Context, first Timeline entry.
 */
function buildDetectionArticleBody(params: CreateSituationPageParams): string {
  const sections: string[] = [];

  sections.push(`## Trigger\n${params.triggerContent}`);
  sections.push(`## Context\n${params.contextContent}`);

  if (params.timelineEntries.length > 0) {
    sections.push(`## Timeline\n${params.timelineEntries.map(e => `- ${e}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new situation_instance wiki page.
 * Called by the detection pipeline when a situation is detected.
 */
export async function createSituationWikiPage(params: CreateSituationPageParams): Promise<string> {
  const articleBody = buildDetectionArticleBody(params);
  const fullContent = assemblePageContent(params.title, params.properties, articleBody);
  const contentTokens = Math.ceil(fullContent.length / 4);
  const crossReferences = extractCrossReferences(fullContent);

  // Embed for search_wiki discoverability
  const embeddings = await embedTexts([fullContent]).catch(() => [null]);
  const embedding = embeddings[0];

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId: params.operatorId,
      pageType: "situation_instance",
      slug: params.slug,
      title: params.title,
      content: fullContent,
      contentTokens,
      crossReferences,
      properties: params.properties as unknown as Prisma.InputJsonValue,
      scope: "operator",
      status: "draft",
      confidence: params.properties.confidence,
      synthesisPath: "detection",
      synthesizedByModel: "content-situation-detector",
      lastSynthesizedAt: new Date(),
      sources: [],
      sourceCount: 0,
      sourceTypes: [],
    },
    select: { id: true },
  });

  // Set embedding via raw SQL (pgvector)
  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
      embeddingStr,
      page.id,
    );
  }

  return page.id;
}

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Update a situation wiki page after reasoning completes.
 * Replaces the full article body with the reasoning engine's output.
 * Re-embeds the page for search discoverability.
 */
export async function updateSituationWikiPage(params: UpdateSituationPageParams): Promise<void> {
  const fullContent = assemblePageContent(params.title, params.properties, params.articleBody);
  const contentTokens = Math.ceil(fullContent.length / 4);
  const crossReferences = extractCrossReferences(fullContent);

  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId: params.operatorId, slug: params.slug } },
    select: { id: true, version: true },
  });

  if (!existing) {
    console.error(`[situation-wiki] Page not found for update: ${params.slug}`);
    return;
  }

  // Re-embed updated content
  const embeddings = await embedTexts([fullContent]).catch(() => [null]);
  const embedding = embeddings[0];

  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage"
       SET "title" = $1, "content" = $2, "contentTokens" = $3,
           "crossReferences" = $4::text[], "properties" = $5::jsonb,
           "confidence" = $6, "version" = "version" + 1,
           "synthesisPath" = $7, "synthesizedByModel" = $8,
           "synthesisCostCents" = $9, "synthesisDurationMs" = $10,
           "lastSynthesizedAt" = NOW(), "updatedAt" = NOW(),
           "embedding" = $11::vector
       WHERE "id" = $12`,
      params.title,
      fullContent,
      contentTokens,
      crossReferences,
      JSON.stringify(params.properties),
      params.properties.confidence,
      "reasoning",
      params.synthesizedByModel,
      params.synthesisCostCents ?? null,
      params.synthesisDurationMs ?? null,
      embeddingStr,
      existing.id,
    );
  } else {
    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        content: fullContent,
        contentTokens,
        crossReferences,
        properties: params.properties as unknown as Prisma.InputJsonValue,
        confidence: params.properties.confidence,
        version: { increment: 1 },
        synthesisPath: "reasoning",
        synthesizedByModel: params.synthesizedByModel,
        synthesisCostCents: params.synthesisCostCents ?? null,
        synthesisDurationMs: params.synthesisDurationMs ?? null,
        lastSynthesizedAt: new Date(),
      },
    });
  }
}

// ── Slug generation ──────────────────────────────────────────────────────────

/**
 * Generate a situation page slug.
 * Format: situation-{type-slug}-{YYYYMMDD}-{subject-slug}
 * Adds a counter suffix if the slug already exists.
 */
export async function generateSituationSlug(
  operatorId: string,
  situationTypeSlug: string,
  subjectSlug: string,
): Promise<string> {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

  // Clean the type slug — remove "situation-type-" prefix if present
  const typeSlug = situationTypeSlug.replace(/^situation-type-/, "");
  const subjectClean = subjectSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  const baseSlug = `situation-${typeSlug}-${dateStr}-${subjectClean}`;

  // Check for collision
  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: baseSlug } },
    select: { id: true },
  });

  if (!existing) return baseSlug;

  // Add counter suffix
  for (let i = 2; i <= 10; i++) {
    const candidateSlug = `${baseSlug}-${i}`;
    const exists = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug: candidateSlug } },
      select: { id: true },
    });
    if (!exists) return candidateSlug;
  }

  // Fallback: timestamp suffix
  return `${baseSlug}-${Date.now()}`;
}
