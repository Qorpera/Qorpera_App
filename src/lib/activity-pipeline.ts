/** @deprecated v0.3.13 — entity resolution via resolveEntity will be replaced with wiki page resolution */
/**
 * ActivitySignal ingestion pipeline.
 *
 * Called by the sync orchestrator when a connector yields { kind: "activity" }.
 * Resolves actor/target emails to entities, derives department routing,
 * deduplicates, and stores ActivitySignal rows.
 */

import { prisma } from "@/lib/db";
import { resolveEntity } from "@/lib/entity-resolution";

export type ActivityInput = {
  operatorId: string;
  connectorId?: string;
  signalType: string;
  actorEmail?: string;
  targetEmails?: string[];
  metadata?: Record<string, unknown>;
  occurredAt: Date;
};

async function resolveEmailToEntity(
  operatorId: string,
  email: string,
): Promise<string | null> {
  return resolveEntity(operatorId, {
    identityValues: { email: email.toLowerCase().trim() },
  });
}

async function getDepartmentIdsForEntity(entityId: string): Promise<string[]> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { primaryDomainId: true },
  });

  const deptIds: string[] = [];
  if (entity?.primaryDomainId) {
    deptIds.push(entity.primaryDomainId);
  }

  // Also check department-member relationships
  const memberRels = await prisma.relationship.findMany({
    where: {
      fromEntityId: entityId,
      relationshipType: { slug: "domain-member" },
    },
    select: { toEntityId: true },
  });
  for (const rel of memberRels) {
    if (!deptIds.includes(rel.toEntityId)) {
      deptIds.push(rel.toEntityId);
    }
  }

  return deptIds;
}

export async function ingestActivity(
  input: ActivityInput,
): Promise<{ id: string } | null> {
  const { operatorId, connectorId, signalType, actorEmail, targetEmails, metadata, occurredAt } = input;

  // 1. Resolve actor
  let actorEntityId: string | null = null;
  if (actorEmail) {
    actorEntityId = await resolveEmailToEntity(operatorId, actorEmail);
  }

  // 2. Resolve targets
  const resolvedTargetIds: string[] = [];
  if (targetEmails?.length) {
    for (const email of targetEmails) {
      const entityId = await resolveEmailToEntity(operatorId, email);
      if (entityId) resolvedTargetIds.push(entityId);
    }
  }

  // 3. Derive department routing
  const domainIds: string[] = [];
  if (actorEntityId) {
    const depts = await getDepartmentIdsForEntity(actorEntityId);
    domainIds.push(...depts);
  }
  for (const targetId of resolvedTargetIds) {
    const depts = await getDepartmentIdsForEntity(targetId);
    for (const d of depts) {
      if (!domainIds.includes(d)) domainIds.push(d);
    }
  }

  // 4. Dedup check
  const existing = await prisma.activitySignal.findFirst({
    where: {
      operatorId,
      signalType,
      occurredAt,
      actorEntityId,
    },
    select: { id: true },
  });
  if (existing) return null;

  // 5. Create ActivitySignal row
  const signal = await prisma.activitySignal.create({
    data: {
      operatorId,
      connectorId: connectorId ?? null,
      signalType,
      actorEntityId,
      targetEntityIds: resolvedTargetIds.length > 0 ? JSON.stringify(resolvedTargetIds) : null,
      domainIds: domainIds.length > 0 ? JSON.stringify(domainIds) : null,
      metadata: JSON.stringify(metadata || {}),
      occurredAt,
    },
  });

  return { id: signal.id };
}

/**
 * Resolve participant emails to department IDs.
 * Used by the sync orchestrator for content department routing.
 */
export async function resolveDepartmentsFromEmails(
  operatorId: string,
  emails?: string[],
): Promise<string[]> {
  if (!emails?.length) return [];

  const domainIds: string[] = [];

  for (const email of emails) {
    const entityId = await resolveEmailToEntity(operatorId, email);
    if (!entityId) continue;

    const depts = await getDepartmentIdsForEntity(entityId);
    for (const d of depts) {
      if (!domainIds.includes(d)) domainIds.push(d);
    }
  }

  return domainIds;
}
