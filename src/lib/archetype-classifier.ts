import { prisma } from "@/lib/db";
import { ensureActionRequiredType } from "@/lib/situation-type-helpers";

// ── Taxonomy Cache ──────────────────────────────────────────────────────────

let archetypeTaxonomyCache: string | null = null;
let archetypeSlugsCache: Set<string> | null = null;

export async function getArchetypeTaxonomy(): Promise<string> {
  if (archetypeTaxonomyCache) return archetypeTaxonomyCache;

  const archetypes = await prisma.situationArchetype.findMany({
    orderBy: { category: "asc" },
  });

  archetypeSlugsCache = new Set(archetypes.map((a) => a.slug));

  let currentCategory = "";
  const lines: string[] = [];

  for (const a of archetypes) {
    if (a.category !== currentCategory) {
      currentCategory = a.category;
      const categoryName = currentCategory
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`\n## ${categoryName}`);
    }

    const examples = (() => {
      try {
        return JSON.parse(a.examplePhrases ?? "[]");
      } catch {
        return [];
      }
    })();
    const exampleStr = examples
      .slice(0, 3)
      .map((e: string) => `"${e}"`)
      .join(", ");

    lines.push(
      `- **${a.slug}**: ${a.description}${exampleStr ? `\n  Examples: ${exampleStr}` : ""}`,
    );
  }

  archetypeTaxonomyCache = lines.join("\n");
  return archetypeTaxonomyCache;
}

export function isValidArchetypeSlug(slug: string): boolean {
  return archetypeSlugsCache?.has(slug) ?? false;
}

export function clearArchetypeCache(): void {
  archetypeTaxonomyCache = null;
  archetypeSlugsCache = null;
}

// ── Archetype-Based SituationType Routing ───────────────────────────────────

// Grows to operators × 29 archetypes × departments (~145k entries at 1k companies × 5 depts).
// Well within memory; add LRU/TTL if operator count reaches tens of thousands.
const archetypeTypeCache = new Map<string, string>();

export async function ensureArchetypeSituationType(
  operatorId: string,
  domainId: string,
  archetypeSlug: string,
): Promise<string> {
  const cacheKey = `${operatorId}:${archetypeSlug}:${domainId}`;
  const cached = archetypeTypeCache.get(cacheKey);
  if (cached) return cached;

  // Look up department name for slug generation
  const dept = await prisma.entity.findUnique({
    where: { id: domainId },
    select: { displayName: true },
  });
  const deptSlug = (dept?.displayName ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Slug format: {archetype}-{department}
  const slug = `${archetypeSlug.replace(/_/g, "-")}-${deptSlug}`;

  // Load archetype for metadata
  const archetype = await prisma.situationArchetype.findUnique({
    where: { slug: archetypeSlug },
  });

  if (!archetype) {
    // Fallback to generic "Action Required" type if archetype not found
    return ensureActionRequiredType(operatorId, domainId);
  }

  const detectionLogic =
    archetype.detectionTemplate ??
    JSON.stringify({
      mode: "content",
      description: archetype.description,
    });

  const sitType = await prisma.situationType.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    create: {
      operatorId,
      slug,
      name: archetype.name,
      description: archetype.description,
      detectionLogic:
        typeof detectionLogic === "string"
          ? detectionLogic
          : JSON.stringify(detectionLogic),
      autonomyLevel: "supervised",
      scopeEntityId: domainId,
      archetypeSlug: archetypeSlug,
      enabled: true,
    },
    update: {
      // Don't overwrite user customizations — only set archetypeSlug if not already set
      archetypeSlug: archetypeSlug,
    },
  });

  archetypeTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}

// Clear type cache (for testing)
export function clearArchetypeTypeCache(): void {
  archetypeTypeCache.clear();
}
