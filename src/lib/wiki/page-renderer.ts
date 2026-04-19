/**
 * Page Renderer — single rendering path for wiki pages served to LLMs.
 *
 * Assembles: title → property table → content → child-page index → activity.
 * Every tool/function that serves wiki pages to LLMs must use renderPageForLLM.
 */

import { prisma } from "@/lib/db";
import { renderPropertyTable } from "./page-schemas";

// ─── Types ──────────────────────────────────────────────

interface WikiPageForRender {
  title: string;
  pageType: string;
  slug: string;
  content: string;
  properties: Record<string, unknown> | null;
  activityContent: string | null;
  status: string;
  confidence: number;
}

interface ChildPage {
  slug: string;
  title: string;
  pageType: string;
}

// ─── Child Index Rendering ──────────────────────────────

const TYPE_GROUP_LABELS: Record<string, string> = {
  person_profile: "People",
  process: "Processes",
  project: "Projects",
  situation_type: "Situation Types",
  situation_instance: "Situations",
  tool_system: "Tools",
  external_relationship: "External Relationships",
  external_contact: "External Contacts",
  initiative: "Initiatives",
  strategic_link: "Strategic Decisions",
  domain_hub: "Departments",
  system_job: "System Jobs",
  system_job_run_report: "System Jobs",
  other: "Other",
};

export function renderChildIndex(children: ChildPage[]): string {
  // Group by pageType
  const groups = new Map<string, string[]>();
  for (const child of children) {
    const list = groups.get(child.pageType) || [];
    list.push(`[[${child.slug}]]`);
    groups.set(child.pageType, list);
  }

  // Render in a stable order based on TYPE_GROUP_LABELS key order
  const orderedTypes = Object.keys(TYPE_GROUP_LABELS);
  const lines: string[] = ["## Pages in This Domain"];

  for (const type of orderedTypes) {
    const slugs = groups.get(type);
    if (!slugs || slugs.length === 0) continue;
    const label = TYPE_GROUP_LABELS[type] || type;
    lines.push(`**${label}:** ${slugs.join(", ")}`);
  }

  // Any types not in the map
  for (const [type, slugs] of groups) {
    if (!TYPE_GROUP_LABELS[type]) {
      lines.push(`**${type}:** ${slugs.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ─── Child Page Query ───────────────────────────────────

/**
 * Find all pages that belong to a hub page.
 *
 * For domain_hub: pages whose properties.domain matches this hub's slug,
 *   OR pages that have this hub in their crossReferences array.
 * For company_overview: all domain_hub pages for this operator,
 *   plus any pages whose properties.domain is null but reference this slug.
 */
export async function getChildPages(
  operatorId: string,
  hubSlug: string,
  hubType: string,
): Promise<ChildPage[]> {
  // Build OR conditions
  const orConditions: any[] = [
    // Pages whose properties.domain points to this hub
    { properties: { path: ["domain"], equals: hubSlug } },
    // Pages that cross-reference this hub
    { crossReferences: { has: hubSlug } },
  ];

  // For company_overview: also include all domain hubs
  if (hubType === "company_overview") {
    orConditions.push({ pageType: "domain_hub" });
  }

  const children = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: { in: ["verified", "draft", "stale"] },
      slug: { not: hubSlug },
      OR: orConditions,
    },
    select: { slug: true, title: true, pageType: true },
    orderBy: [{ pageType: "asc" }, { title: "asc" }],
  });

  // Deduplicate by slug (a page might match multiple OR branches)
  const seen = new Set<string>();
  return children.filter((c) => {
    if (seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  });
}

// ─── Main Renderer ──────────────────────────────────────

/**
 * Render a wiki page as formatted text for LLM consumption.
 * Assembles: title → property table → content → child-page index → activity.
 *
 * This is the SINGLE rendering path. Every tool/function that serves
 * wiki pages to LLMs must use this function.
 */
export async function renderPageForLLM(
  operatorId: string,
  page: WikiPageForRender,
): Promise<string> {
  const parts: string[] = [];

  // 1. Title with metadata
  const statusNote = page.status !== "verified"
    ? ` [${page.status}]`
    : "";
  parts.push(`# ${page.title} [${page.pageType}]${statusNote}`);

  // 2. Property table from JSONB (never from content)
  if (page.properties && Object.keys(page.properties).length > 0) {
    const propTable = renderPropertyTable(page.pageType, page.properties as Record<string, unknown>);
    if (propTable) parts.push(propTable);
  }

  // 3. Content (pure prose — no property table, no index embedded)
  if (page.content) {
    parts.push(page.content);
  }

  // 4. Auto-injected child-page index (hubs + company_overview only)
  if (["domain_hub", "company_overview"].includes(page.pageType)) {
    const children = await getChildPages(operatorId, page.slug, page.pageType);
    if (children.length > 0) {
      parts.push(renderChildIndex(children));
    }
  }

  // 5. Activity section if present
  if (page.activityContent) {
    parts.push(`## Recent Activity\n${page.activityContent}`);
  }

  return parts.join("\n\n");
}
