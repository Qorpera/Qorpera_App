import { prisma } from "@/lib/db";

export type AuditLogInput = {
  action: string;
  actorType: string;
  actorId?: string;
  entityId?: string;
  entityTypeSlug?: string;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  policyRuleId?: string;
  proposalId?: string;
  outcome: string;
  duration?: number;
};

/**
 * Append-only audit log entry. Fire-and-forget safe.
 */
export async function logAction(operatorId: string, input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditEntry.create({
      data: {
        operatorId,
        action: input.action,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        entityId: input.entityId ?? null,
        entityTypeSlug: input.entityTypeSlug ?? null,
        inputSnapshot: input.inputSnapshot ? JSON.stringify(input.inputSnapshot) : null,
        outputSnapshot: input.outputSnapshot ? JSON.stringify(input.outputSnapshot) : null,
        policyRuleId: input.policyRuleId ?? null,
        proposalId: input.proposalId ?? null,
        outcome: input.outcome,
        duration: input.duration ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit entry:", err);
  }
}

/**
 * List audit entries with optional filters.
 */
export async function listAuditEntries(
  operatorId: string,
  filters: {
    action?: string;
    entityId?: string;
    entityTypeSlug?: string;
    outcome?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const { action, entityId, entityTypeSlug, outcome, limit = 50, offset = 0 } = filters;

  const where: Record<string, unknown> = { operatorId };
  if (action) where.action = action;
  if (entityId) where.entityId = entityId;
  if (entityTypeSlug) where.entityTypeSlug = entityTypeSlug;
  if (outcome) where.outcome = outcome;

  const [entries, total] = await Promise.all([
    prisma.auditEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.auditEntry.count({ where }),
  ]);

  return { entries, total };
}

/**
 * Get decision lineage for an entity — all audit entries related to it.
 */
export async function getDecisionLineage(operatorId: string, entityId: string) {
  return prisma.auditEntry.findMany({
    where: { operatorId, entityId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
