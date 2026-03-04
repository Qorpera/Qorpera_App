import { prisma } from "@/lib/db";
import { executeApprovedProposal } from "./oem-policy-gateway";
import { logAction } from "./audit-logger";

/**
 * Review (approve/reject) a proposal and optionally execute it.
 */
export async function reviewProposal(
  operatorId: string,
  proposalId: string,
  decision: "APPROVED" | "REJECTED",
  reviewNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const proposal = await prisma.actionProposal.findFirst({
    where: { id: proposalId, operatorId, status: "PENDING" },
  });
  if (!proposal) return { ok: false, error: "Proposal not found or already reviewed" };

  // Check expiry
  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    await prisma.actionProposal.update({
      where: { id: proposalId },
      data: { status: "EXPIRED" },
    });
    return { ok: false, error: "Proposal has expired" };
  }

  await prisma.actionProposal.update({
    where: { id: proposalId },
    data: {
      status: decision,
      reviewedBy: operatorId,
      reviewNote: reviewNote ?? null,
      reviewedAt: new Date(),
    },
  });

  await logAction(operatorId, {
    action: `proposal_${decision.toLowerCase()}`,
    actorType: "operator",
    actorId: operatorId,
    entityId: proposal.entityId ?? undefined,
    entityTypeSlug: proposal.entityTypeSlug ?? undefined,
    outcome: "success",
    proposalId,
    inputSnapshot: { decision, reviewNote },
  });

  // Auto-execute approved proposals
  if (decision === "APPROVED") {
    const success = await executeApprovedProposal(operatorId, proposalId);
    if (!success) {
      return { ok: true, error: "Approved but execution failed" };
    }
  }

  return { ok: true };
}

/**
 * List proposals with optional status filter.
 */
export async function listProposals(
  operatorId: string,
  status?: string,
  limit = 50,
) {
  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;

  const [proposals, total] = await Promise.all([
    prisma.actionProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        entity: {
          select: { id: true, displayName: true, entityType: { select: { name: true, slug: true } } },
        },
      },
    }),
    prisma.actionProposal.count({ where }),
  ]);

  return { proposals, total };
}

/**
 * Get pending proposal count for badge display.
 */
export async function getPendingProposalCount(operatorId: string): Promise<number> {
  return prisma.actionProposal.count({
    where: { operatorId, status: "PENDING" },
  });
}
