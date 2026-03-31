import { prisma } from "@/lib/db";

// ── Shared SituationType ensure helpers ─────────────────────────────────────
// Extracted here to avoid circular imports between content-situation-detector
// and archetype-classifier.

const actionRequiredTypeCache = new Map<string, string>();

export async function ensureActionRequiredType(
  operatorId: string,
  departmentId: string,
): Promise<string> {
  const cacheKey = `${operatorId}:${departmentId}`;
  const cached = actionRequiredTypeCache.get(cacheKey);
  if (cached) return cached;

  // Look up department name for slug
  const dept = await prisma.entity.findUnique({
    where: { id: departmentId },
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
      // mode: "content" is deliberately unrecognized by the cron detector's
      // safeParseDetection(), so these types are skipped during cron detection.
      // Content-detected situations are created inline by this module, not by the cron.
      detectionLogic: JSON.stringify({
        mode: "content",
        description: "Detected from incoming communications",
      }),
      autonomyLevel: "supervised",
      scopeEntityId: departmentId,
      enabled: true,
    },
    update: {}, // no-op if exists
  });

  actionRequiredTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}

const awarenessTypeCache = new Map<string, string>();

export async function ensureAwarenessType(
  operatorId: string,
  departmentId: string,
): Promise<string> {
  const cacheKey = `${operatorId}:${departmentId}`;
  const cached = awarenessTypeCache.get(cacheKey);
  if (cached) return cached;

  const dept = await prisma.entity.findUnique({
    where: { id: departmentId },
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
      scopeEntityId: departmentId,
      enabled: true,
    },
    update: {},
  });

  awarenessTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}
