import { prisma } from "@/lib/db";
import { evaluatePolicy } from "./policy-engine";
import type { ActorInfo } from "./entity-resolution";

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
    return { status: "denied" };
  }

  if (eval_.effect === "REQUIRE_APPROVAL") {
    return { status: "proposed" };
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
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    include: { entityType: { select: { slug: true } } },
  });
  if (!entity) return { status: "denied" };

  const eval_ = await evaluatePolicy(operatorId, "update", {
    entityTypeSlug: entity.entityType.slug,
    entityId,
  });

  if (eval_.effect === "DENY") {
    return { status: "denied" };
  }

  if (eval_.effect === "REQUIRE_APPROVAL") {
    return { status: "proposed" };
  }

  // ALLOW
  const { updateEntity } = await import("@/lib/entity-model-store");
  await updateEntity(operatorId, entityId, fields);

  return { status: "allowed", entityId };
}

/**
 * Delete entity through policy gateway.
 */
export async function deleteEntityGoverned(
  operatorId: string,
  entityId: string,
  actor: ActorInfo,
): Promise<GatewayResult> {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    include: { entityType: { select: { slug: true } } },
  });
  if (!entity) return { status: "denied" };

  const eval_ = await evaluatePolicy(operatorId, "delete", {
    entityTypeSlug: entity.entityType.slug,
    entityId,
  });

  if (eval_.effect === "DENY") {
    return { status: "denied" };
  }

  if (eval_.effect === "REQUIRE_APPROVAL") {
    return { status: "proposed" };
  }

  // ALLOW
  const { deleteEntity } = await import("@/lib/entity-model-store");
  await deleteEntity(operatorId, entityId);

  return { status: "allowed", entityId };
}
