import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";

// ── Types ──────────────────────────────────────────────

export interface OntologyNode {
  domain: string;
  subDomain: string;
  knowledgeRequirement: string;
  pageTypes: string[];  // What types of pages satisfy this requirement
  priority: "critical" | "important" | "useful";
}

export interface OntologyIndex {
  vertical: string;
  description: string;
  domains: Array<{
    name: string;
    description: string;
    requirements: OntologyNode[];
  }>;
}

// ── Load Ontology ──────────────────────────────────────

/**
 * Load the ontology for a given industry vertical.
 * Returns null if no ontology exists for this vertical.
 */
export async function loadOntology(vertical: string): Promise<OntologyIndex | null> {
  const slug = `ontology-${vertical.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const page = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug, pageType: "ontology_index", status: { in: ["verified", "draft"] } },
    select: { content: true },
  });

  if (!page) return null;

  return parseOntologyContent(page.content, vertical);
}

/**
 * Find which ontology requirements are already covered by existing system pages.
 * Returns requirements that are NOT yet covered — the gaps.
 */
export async function findOntologyGaps(vertical: string): Promise<OntologyNode[]> {
  const ontology = await loadOntology(vertical);
  if (!ontology) return [];

  const allRequirements = ontology.domains.flatMap(d => d.requirements);
  const gaps: OntologyNode[] = [];

  for (const req of allRequirements) {
    const searchQuery = `${req.domain} ${req.subDomain} ${req.knowledgeRequirement}`;
    const embeddings = await embedChunks([searchQuery]).catch(() => [null]);

    if (!embeddings[0]) {
      gaps.push(req);
      continue;
    }

    const embeddingStr = `[${embeddings[0].join(",")}]`;
    const matches = await prisma.$queryRawUnsafe<Array<{ slug: string; similarity: number }>>(
      `SELECT slug, 1 - (embedding <=> $1::vector) as similarity
       FROM "KnowledgePage"
       WHERE scope = 'system'
         AND status IN ('verified', 'draft')
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 1`,
      embeddingStr,
    );

    // If best match is below threshold, this requirement is a gap
    if (matches.length === 0 || matches[0].similarity < 0.75) {
      gaps.push(req);
    }
  }

  return gaps;
}

/**
 * Get a formatted string of ontology gaps for injection into a synthesis prompt.
 */
export async function getOntologyGapsForPrompt(vertical: string): Promise<string | null> {
  const gaps = await findOntologyGaps(vertical);
  if (gaps.length === 0) return null;

  const criticalGaps = gaps.filter(g => g.priority === "critical");
  const importantGaps = gaps.filter(g => g.priority === "important");
  const usefulGaps = gaps.filter(g => g.priority === "useful");

  const sections: string[] = [];

  if (criticalGaps.length > 0) {
    sections.push("CRITICAL GAPS (prioritize filling these):\n" +
      criticalGaps.map(g => `- [${g.domain} > ${g.subDomain}] ${g.knowledgeRequirement} (needs: ${g.pageTypes.join(", ")})`).join("\n"));
  }
  if (importantGaps.length > 0) {
    sections.push("IMPORTANT GAPS:\n" +
      importantGaps.map(g => `- [${g.domain} > ${g.subDomain}] ${g.knowledgeRequirement}`).join("\n"));
  }
  if (usefulGaps.length > 0) {
    sections.push("USEFUL GAPS:\n" +
      usefulGaps.map(g => `- [${g.domain} > ${g.subDomain}] ${g.knowledgeRequirement}`).join("\n"));
  }

  return sections.join("\n\n");
}

// ── Ontology Parser ────────────────────────────────────

function parseOntologyContent(content: string, vertical: string): OntologyIndex {
  const index: OntologyIndex = {
    vertical,
    description: "",
    domains: [],
  };

  const lines = content.split("\n");
  let currentDomain: { name: string; description: string; requirements: OntologyNode[] } | null = null;

  for (const line of lines) {
    // Skip title
    if (line.startsWith("# ")) continue;

    // Domain header: ## Domain Name
    if (line.startsWith("## ")) {
      if (currentDomain) index.domains.push(currentDomain);
      currentDomain = { name: line.slice(3).trim(), description: "", requirements: [] };
      continue;
    }

    // Domain description (first non-empty line after ##)
    if (currentDomain && currentDomain.requirements.length === 0 && !line.startsWith("- ") && line.trim()) {
      currentDomain.description += line.trim() + " ";
      continue;
    }

    // Requirement: - [priority] sub-domain: requirement (types: x, y)
    const reqMatch = line.match(/^- \[(critical|important|useful)\]\s*(.+?):\s*(.+?)(?:\s*\((?:needs|types):\s*(.+?)\))?$/);
    if (reqMatch && currentDomain) {
      currentDomain.requirements.push({
        domain: currentDomain.name,
        subDomain: reqMatch[2].trim(),
        knowledgeRequirement: reqMatch[3].trim(),
        pageTypes: reqMatch[4] ? reqMatch[4].split(",").map(t => t.trim()) : ["topic_synthesis"],
        priority: reqMatch[1] as "critical" | "important" | "useful",
      });
    }
  }

  if (currentDomain) index.domains.push(currentDomain);

  return index;
}

// ── Seed Ontology Generator ────────────────────────────

/**
 * Create a seed ontology page for a given vertical.
 * Only creates if one doesn't already exist.
 */
export async function seedOntology(vertical: string, content: string): Promise<string | null> {
  const slug = `ontology-${vertical.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const existing = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug },
  });
  if (existing) return null;

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId: null,
      scope: "system",
      pageType: "ontology_index",
      title: `Knowledge Ontology — ${vertical}`,
      slug,
      content,
      contentTokens: Math.ceil(content.length / 4),
      crossReferences: [],
      sources: [],
      sourceCount: 0,
      sourceTypes: ["manual"],
      status: "verified",
      confidence: 1.0,
      version: 1,
      synthesisPath: "manual",
      synthesizedByModel: "human",
      lastSynthesizedAt: new Date(),
      verifiedAt: new Date(),
      verifiedByModel: "human",
    },
    select: { id: true },
  });

  // Embed
  embedChunks([content]).then(([embedding]) => {
    if (embedding) {
      const embeddingStr = `[${embedding.join(",")}]`;
      prisma.$executeRawUnsafe(
        `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
        embeddingStr,
        page.id,
      ).catch(() => {});
    }
  }).catch(() => {});

  return page.id;
}
