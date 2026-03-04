import { prisma } from "@/lib/db";
import { evaluatePolicy } from "./policy-engine";
import { logAction } from "./audit-logger";
import type { ActorInfo } from "./oem-entity-resolution";

type GatewayResult = {
  status: "allowed" | "proposed" | "denied";
  entityId?: string;
  proposalId?: string;
};

/**
 * Create entity through policy gateway. Evaluates policies, creates proposal if needed.
 */
export async function createEntityGoverned(
  operatorId: string,
  input: {
    entityTypeId: string;
    displayName: string;
    sourceSystem?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
    properties?: Record<string, string>;
    typeSlug: string;
  },
  actor: ActorInfo,
): Promise<GatewayResult> {
  const eval_ = await evaluatePolicy(operatorId, "create", {
    entityTypeSlug: input.typeSlug,
  });

  if (eval_.effect === "DENY") {
    await logAction(operatorId, {
      action: "create_entity",
      actorType: actor.type,
      actorId: actor.id,
      entityTypeSlug: input.typeSlug,
      inputSnapshot: input,
      outcome: "denied",
      policyRuleId: eval_.matchedRule?.id,
    });
    return { status: "denied" };
  }

  if (eval_.effect === "REQUIRE_APPROVAL") {
    const proposal = await prisma.actionProposal.create({
      data: {
        operatorId,
        actionType: "create_entity",
        description: `Create ${input.typeSlug}: ${input.displayName}`,
        entityTypeSlug: input.typeSlug,
        sourceAgent: actor.id,
        inputData: JSON.stringify(input),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    await logAction(operatorId, {
      action: "create_entity",
      actorType: actor.type,
      actorId: actor.id,
      entityTypeSlug: input.typeSlug,
      inputSnapshot: input,
      outcome: "pending_approval",
      proposalId: proposal.id,
      policyRuleId: eval_.matchedRule?.id,
    });

    return { status: "proposed", proposalId: proposal.id };
  }

  // ALLOW — create directly
  const { createEntity } = await import("@/lib/entity-model-store");
  const entity = await createEntity(operatorId, {
    entityTypeId: input.entityTypeId,
    displayName: input.displayName,
    sourceSystem: input.sourceSystem,
    externalId: input.externalId,
    metadata: input.metadata,
    properties: input.properties,
  });

  await logAction(operatorId, {
    action: "create_entity",
    actorType: actor.type,
    actorId: actor.id,
    entityId: entity?.id,
    entityTypeSlug: input.typeSlug,
    inputSnapshot: input,
    outcome: "success",
    policyRuleId: eval_.matchedRule?.id,
  });

  // Fire action rules for the new entity
  if (entity?.id) {
    const { evaluateRulesForEntity } = await import("@/lib/action-rule-store");
    evaluateRulesForEntity(operatorId, { id: entity.id, typeSlug: input.typeSlug }, "mutation").catch(() => {});
  }

  return { status: "allowed", entityId: entity?.id };
}

/**
 * Update entity through policy gateway.
 */
export async function updateEntityGoverned(
  operatorId: string,
  entityId: string,
  fields: { properties?: Record<string, string>; displayName?: string },
  actor: ActorInfo,
): Promise<GatewayResult> {
  const entity = await prisma.oemEntity.findFirst({
    where: { id: entityId, operatorId },
    include: { entityType: { select: { slug: true } } },
  });
  if (!entity) return { status: "denied" };

  const eval_ = await evaluatePolicy(operatorId, "update", {
    entityTypeSlug: entity.entityType.slug,
    entityId,
  });

  if (eval_.effect === "DENY") {
    await logAction(operatorId, {
      action: "update_entity",
      actorType: actor.type,
      actorId: actor.id,
      entityId,
      entityTypeSlug: entity.entityType.slug,
      inputSnapshot: fields,
      outcome: "denied",
      policyRuleId: eval_.matchedRule?.id,
    });
    return { status: "denied" };
  }

  if (eval_.effect === "REQUIRE_APPROVAL") {
    const proposal = await prisma.actionProposal.create({
      data: {
        operatorId,
        actionType: "update_entity",
        description: `Update ${entity.entityType.slug}: ${entity.displayName}`,
        entityId,
        entityTypeSlug: entity.entityType.slug,
        sourceAgent: actor.id,
        inputData: JSON.stringify(fields),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    await logAction(operatorId, {
      action: "update_entity",
      actorType: actor.type,
      actorId: actor.id,
      entityId,
      entityTypeSlug: entity.entityType.slug,
      inputSnapshot: fields,
      outcome: "pending_approval",
      proposalId: proposal.id,
      policyRuleId: eval_.matchedRule?.id,
    });

    return { status: "proposed", proposalId: proposal.id };
  }

  // ALLOW
  const { updateEntity } = await import("@/lib/entity-model-store");
  await updateEntity(operatorId, entityId, fields);

  await logAction(operatorId, {
    action: "update_entity",
    actorType: actor.type,
    actorId: actor.id,
    entityId,
    entityTypeSlug: entity.entityType.slug,
    inputSnapshot: fields,
    outcome: "success",
    policyRuleId: eval_.matchedRule?.id,
  });

  // Fire action rules for the updated entity
  const { evaluateRulesForEntity } = await import("@/lib/action-rule-store");
  evaluateRulesForEntity(operatorId, { id: entityId, typeSlug: entity.entityType.slug }, "mutation").catch(() => {});

  return { status: "allowed", entityId };
}

/**
 * Execute an approved proposal.
 */
export async function executeApprovedProposal(
  operatorId: string,
  proposalId: string,
): Promise<boolean> {
  const proposal = await prisma.actionProposal.findFirst({
    where: { id: proposalId, operatorId, status: "APPROVED" },
  });
  if (!proposal || !proposal.inputData) return false;

  const input = JSON.parse(proposal.inputData);

  try {
    if (proposal.actionType === "create_entity") {
      const { createEntity } = await import("@/lib/entity-model-store");
      await createEntity(operatorId, {
        entityTypeId: input.entityTypeId,
        displayName: input.displayName,
        sourceSystem: input.sourceSystem,
        externalId: input.externalId,
        metadata: input.metadata,
        properties: input.properties,
      });
    } else if (proposal.actionType === "update_entity" && proposal.entityId) {
      const { updateEntity } = await import("@/lib/entity-model-store");
      await updateEntity(operatorId, proposal.entityId, input);
    } else if (proposal.actionType === "delete_entity" && proposal.entityId) {
      const { deleteEntity } = await import("@/lib/entity-model-store");
      await deleteEntity(operatorId, proposal.entityId);
    }

    await logAction(operatorId, {
      action: `execute_proposal_${proposal.actionType}`,
      actorType: "system",
      entityId: proposal.entityId ?? undefined,
      entityTypeSlug: proposal.entityTypeSlug ?? undefined,
      inputSnapshot: input,
      outcome: "success",
      proposalId,
    });

    // Fire action rules for create/update proposals
    if (proposal.entityId && proposal.entityTypeSlug &&
        (proposal.actionType === "create_entity" || proposal.actionType === "update_entity")) {
      const { evaluateRulesForEntity } = await import("@/lib/action-rule-store");
      evaluateRulesForEntity(operatorId, { id: proposal.entityId, typeSlug: proposal.entityTypeSlug }, "mutation").catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("[policy-gateway] Failed to execute proposal:", err);
    await logAction(operatorId, {
      action: `execute_proposal_${proposal.actionType}`,
      actorType: "system",
      entityId: proposal.entityId ?? undefined,
      inputSnapshot: input,
      outcome: "error",
      proposalId,
      outputSnapshot: { error: String(err) },
    });
    return false;
  }
}
