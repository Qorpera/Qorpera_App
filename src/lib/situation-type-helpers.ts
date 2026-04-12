import { prisma } from "@/lib/db";

// ── Shared SituationType ensure helpers ─────────────────────────────────────
// Extracted here to avoid circular imports between content-situation-detector
// and archetype-classifier.

const actionRequiredTypeCache = new Map<string, string>();

export async function ensureActionRequiredType(
  operatorId: string,
  domainId: string,
  domainPageSlug?: string | null,
): Promise<string> {
  const cacheKey = `${operatorId}:${domainId}`;
  const cached = actionRequiredTypeCache.get(cacheKey);
  if (cached) return cached;

  // Look up department name for slug
  const dept = await prisma.entity.findUnique({
    where: { id: domainId },
    select: { displayName: true },
  });
  const deptSlug = (dept?.displayName ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `action-required-${deptSlug}`;

  const sitType = await prisma.situationType.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    create: {
      operatorId,
      slug,
      name: "Action Required",
      description:
        "Communication-detected situations requiring action from team members in this department.",
      detectionLogic: JSON.stringify({
        mode: "content",
        description: "Detected from incoming communications",
      }),
      autonomyLevel: "supervised",
      scopeEntityId: domainId,
      enabled: true,
      ...(domainPageSlug ? { wikiPageSlug: `situation-type-action-required-${domainPageSlug}` } : {}),
    },
    update: {},
  });

  actionRequiredTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}

const awarenessTypeCache = new Map<string, string>();

export async function ensureAwarenessType(
  operatorId: string,
  domainId: string,
  domainPageSlug?: string | null,
): Promise<string> {
  const cacheKey = `${operatorId}:${domainId}`;
  const cached = awarenessTypeCache.get(cacheKey);
  if (cached) return cached;

  const dept = await prisma.entity.findUnique({
    where: { id: domainId },
    select: { displayName: true },
  });
  const deptSlug = (dept?.displayName ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `awareness-${deptSlug}`;

  const sitType = await prisma.situationType.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    create: {
      operatorId,
      slug,
      name: "Awareness",
      description: "Items the employee should be aware of but that don't require direct action.",
      detectionLogic: JSON.stringify({
        mode: "content",
        description: "Awareness items detected from incoming communications",
      }),
      autonomyLevel: "supervised",
      scopeEntityId: domainId,
      enabled: true,
      ...(domainPageSlug ? { wikiPageSlug: `situation-type-awareness-${domainPageSlug}` } : {}),
    },
    update: {},
  });

  awarenessTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}
