/**
 * ML Identity Resolution Pipeline.
 *
 * Detects when entities from different sources are the same person/company
 * and merges them. Uses pgvector nearest-neighbor for candidate generation,
 * weighted scoring for match confidence, and transactional merge execution.
 */

import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";
import { CATEGORY_PRIORITY } from "@/lib/hardcoded-type-defs";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MergeCandidate = {
  entityId: string;
  displayName: string;
  sourceSystem: string | null;
  similarity: number;
  score: number;
  signals: Record<string, boolean | number>;
  classification: "auto_merge" | "suggestion";
};

type AbsorbedSnapshot = {
  entityId: string;
  displayName: string;
  status: string;
  category: string;
  sourceSystem: string | null;
  externalId: string | null;
  mergedIntoId: string | null;
  propertyValues: Array<{ propertyId: string; value: string }>;
  fromRelationships: Array<{ relationshipTypeId: string; toEntityId: string; metadata: string | null }>;
  toRelationships: Array<{ relationshipTypeId: string; fromEntityId: string; metadata: string | null }>;
};

// ── 1. Entity representation + embedding ────────────────────────────────────

export async function buildEntityRepresentation(entity: {
  id: string;
  displayName: string;
  operatorId: string;
  sourceSystem?: string | null;
  entityType?: { slug: string } | null;
}): Promise<string> {
  // Load identity-role properties + name-like properties
  const propertyValues = await prisma.propertyValue.findMany({
    where: { entityId: entity.id },
    include: {
      property: {
        select: { slug: true, name: true, identityRole: true },
      },
    },
  });

  const parts: string[] = [entity.displayName];

  for (const pv of propertyValues) {
    if (!pv.value) continue;
    if (
      pv.property.identityRole ||
      ["company_name", "name", "website", "company", "firstname", "lastname"].includes(pv.property.slug)
    ) {
      parts.push(pv.value);
    }
  }

  if (entity.sourceSystem) parts.push(entity.sourceSystem);
  if (entity.entityType?.slug) parts.push(entity.entityType.slug);

  return parts.filter(Boolean).join(" | ");
}

export async function updateEntityEmbedding(entityId: string): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      displayName: true,
      operatorId: true,
      sourceSystem: true,
      entityType: { select: { slug: true } },
    },
  });
  if (!entity) return;

  const representation = await buildEntityRepresentation(entity);
  const embeddings = await embedChunks([representation]);
  const embedding = embeddings[0];
  if (!embedding) return;

  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Entity" SET "entityEmbedding" = $1::vector WHERE id = $2`,
    vectorLiteral,
    entityId,
  );
}

export async function rebuildAllEntityEmbeddings(operatorId: string): Promise<number> {
  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      status: { not: "merged" },
    },
    select: { id: true },
  });

  let processed = 0;
  for (const entity of entities) {
    await updateEntityEmbedding(entity.id);
    processed++;
    if (processed % 50 === 0) {
      console.log(`[identity-resolution] Embedded ${processed}/${entities.length} entities`);
    }
  }

  console.log(`[identity-resolution] Finished embedding ${processed} entities for operator ${operatorId}`);
  return processed;
}

// ── 2. Candidate generation + scoring ───────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "").replace(/^0+/, "");
}

async function getIdentityValues(
  entityId: string,
): Promise<{ emails: string[]; domains: string[]; phones: string[] }> {
  const pvs = await prisma.propertyValue.findMany({
    where: {
      entityId,
      property: { identityRole: { not: null } },
    },
    include: { property: { select: { identityRole: true } } },
  });

  const emails: string[] = [];
  const domains: string[] = [];
  const phones: string[] = [];

  for (const pv of pvs) {
    if (!pv.value) continue;
    switch (pv.property.identityRole) {
      case "email":
        emails.push(pv.value.toLowerCase().trim());
        break;
      case "domain":
        domains.push(pv.value.toLowerCase().trim());
        break;
      case "phone":
        phones.push(normalizePhone(pv.value));
        break;
    }
  }

  return { emails, domains, phones };
}

export async function findMergeCandidates(
  entityId: string,
  operatorId: string,
): Promise<MergeCandidate[]> {
  // Get source entity's embedding
  const embeddingRows = await prisma.$queryRawUnsafe<Array<{ embedding: string }>>(
    `SELECT "entityEmbedding"::text as embedding FROM "Entity" WHERE id = $1 AND "entityEmbedding" IS NOT NULL`,
    entityId,
  );

  if (!embeddingRows.length || !embeddingRows[0].embedding) return [];

  const sourceEntity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { sourceSystem: true, displayName: true },
  });
  if (!sourceEntity) return [];

  const embedding = embeddingRows[0].embedding;

  // pgvector nearest-neighbor search
  const candidates = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      displayName: string;
      sourceSystem: string | null;
      externalId: string | null;
      similarity: number;
    }>
  >(
    `SELECT e.id, e."displayName", e."sourceSystem", e."externalId",
            1 - (e."entityEmbedding" <=> $1::vector) as similarity
     FROM "Entity" e
     WHERE e."operatorId" = $2
       AND e.id != $3
       AND e.status != 'merged'
       AND e."entityEmbedding" IS NOT NULL
     ORDER BY e."entityEmbedding" <=> $1::vector
     LIMIT 10`,
    embedding,
    operatorId,
    entityId,
  );

  if (!candidates.length) return [];

  // Score each candidate
  const sourceIdentity = await getIdentityValues(entityId);
  const results: MergeCandidate[] = [];

  for (const candidate of candidates) {
    const signals: Record<string, boolean | number> = {};
    let score = 0;

    // Same source system: hard block
    if (candidate.sourceSystem && candidate.sourceSystem === sourceEntity.sourceSystem) {
      signals.same_source = true;
      score -= 1.0;
    }

    // Email match
    const candidateIdentity = await getIdentityValues(candidate.id);
    const emailMatch = sourceIdentity.emails.some((e) =>
      candidateIdentity.emails.includes(e),
    );
    if (emailMatch) {
      signals.email_match = true;
      score += 0.5;
    }

    // Domain match
    const domainMatch = sourceIdentity.domains.some((d) =>
      candidateIdentity.domains.includes(d),
    );
    if (domainMatch) {
      signals.domain_match = true;
      score += 0.15;
    }

    // Phone match (normalized)
    const phoneMatch = sourceIdentity.phones.some((p) =>
      candidateIdentity.phones.some((cp) => cp === p),
    );
    if (phoneMatch) {
      signals.phone_match = true;
      score += 0.2;
    }

    // Embedding similarity bonus
    const sim = Number(candidate.similarity);
    signals.embedding_similarity = sim;
    if (sim > 0.85) {
      signals.high_similarity = true;
      score += 0.15;
    }

    if (score < 0.5) continue;

    results.push({
      entityId: candidate.id,
      displayName: candidate.displayName,
      sourceSystem: candidate.sourceSystem,
      similarity: sim,
      score,
      signals,
      classification: score >= 0.8 ? "auto_merge" : "suggestion",
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── 3. Merge execution ──────────────────────────────────────────────────────

async function determineSurvivor(
  operatorId: string,
  entityAId: string,
  entityBId: string,
): Promise<{ survivorId: string; absorbedId: string }> {
  const [a, b] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: entityAId },
      select: { id: true, category: true, createdAt: true, _count: { select: { propertyValues: true } } },
    }),
    prisma.entity.findUnique({
      where: { id: entityBId },
      select: { id: true, category: true, createdAt: true, _count: { select: { propertyValues: true } } },
    }),
  ]);

  if (!a || !b) throw new Error("One or both entities not found");

  const aPriority = CATEGORY_PRIORITY[a.category] ?? 0;
  const bPriority = CATEGORY_PRIORITY[b.category] ?? 0;

  if (aPriority !== bPriority) {
    return aPriority > bPriority
      ? { survivorId: a.id, absorbedId: b.id }
      : { survivorId: b.id, absorbedId: a.id };
  }

  // Same category — more properties wins
  if (a._count.propertyValues !== b._count.propertyValues) {
    return a._count.propertyValues > b._count.propertyValues
      ? { survivorId: a.id, absorbedId: b.id }
      : { survivorId: b.id, absorbedId: a.id };
  }

  // Same property count — older entity wins
  return a.createdAt <= b.createdAt
    ? { survivorId: a.id, absorbedId: b.id }
    : { survivorId: b.id, absorbedId: a.id };
}

async function captureSnapshot(absorbedId: string): Promise<AbsorbedSnapshot> {
  const entity = await prisma.entity.findUnique({
    where: { id: absorbedId },
    select: {
      id: true,
      displayName: true,
      status: true,
      category: true,
      sourceSystem: true,
      externalId: true,
      mergedIntoId: true,
    },
  });
  if (!entity) throw new Error(`Entity ${absorbedId} not found for snapshot`);

  const propertyValues = await prisma.propertyValue.findMany({
    where: { entityId: absorbedId },
    select: { propertyId: true, value: true },
  });

  const fromRels = await prisma.relationship.findMany({
    where: { fromEntityId: absorbedId },
    select: { relationshipTypeId: true, toEntityId: true, metadata: true },
  });

  const toRels = await prisma.relationship.findMany({
    where: { toEntityId: absorbedId },
    select: { relationshipTypeId: true, fromEntityId: true, metadata: true },
  });

  return {
    entityId: entity.id,
    displayName: entity.displayName,
    status: entity.status,
    category: entity.category,
    sourceSystem: entity.sourceSystem,
    externalId: entity.externalId,
    mergedIntoId: entity.mergedIntoId,
    propertyValues: propertyValues.map((pv) => ({ propertyId: pv.propertyId, value: pv.value })),
    fromRelationships: fromRels.map((r) => ({
      relationshipTypeId: r.relationshipTypeId,
      toEntityId: r.toEntityId,
      metadata: r.metadata,
    })),
    toRelationships: toRels.map((r) => ({
      relationshipTypeId: r.relationshipTypeId,
      fromEntityId: r.fromEntityId,
      metadata: r.metadata,
    })),
  };
}

export async function mergeEntities(
  operatorId: string,
  survivorId: string,
  absorbedId: string,
  mergeType: "auto_identity" | "ml_high_confidence" | "admin_manual",
  confidence?: number,
  signals?: Record<string, unknown>,
): Promise<void> {
  // Capture snapshot before merge
  const snapshot = await captureSnapshot(absorbedId);

  await prisma.$transaction(async (tx) => {
    // 1. Copy PropertyValues (additive — skip conflicts)
    const survivorProps = await tx.propertyValue.findMany({
      where: { entityId: survivorId },
      select: { propertyId: true },
    });
    const survivorPropIds = new Set(survivorProps.map((p) => p.propertyId));

    const absorbedProps = await tx.propertyValue.findMany({
      where: { entityId: absorbedId },
    });

    for (const prop of absorbedProps) {
      if (!survivorPropIds.has(prop.propertyId)) {
        await tx.propertyValue.create({
          data: {
            entityId: survivorId,
            propertyId: prop.propertyId,
            value: prop.value,
          },
        });
      }
    }

    // 2. Redirect Relationships (skip duplicates via upsert-like logic)
    const absorbedFromRels = await tx.relationship.findMany({
      where: { fromEntityId: absorbedId },
    });
    for (const rel of absorbedFromRels) {
      if (rel.toEntityId === survivorId) {
        // Would create self-referencing — delete instead
        await tx.relationship.delete({ where: { id: rel.id } });
        continue;
      }
      const existing = await tx.relationship.findFirst({
        where: {
          relationshipTypeId: rel.relationshipTypeId,
          fromEntityId: survivorId,
          toEntityId: rel.toEntityId,
        },
      });
      if (existing) {
        await tx.relationship.delete({ where: { id: rel.id } });
      } else {
        await tx.relationship.update({
          where: { id: rel.id },
          data: { fromEntityId: survivorId },
        });
      }
    }

    const absorbedToRels = await tx.relationship.findMany({
      where: { toEntityId: absorbedId },
    });
    for (const rel of absorbedToRels) {
      if (rel.fromEntityId === survivorId) {
        await tx.relationship.delete({ where: { id: rel.id } });
        continue;
      }
      const existing = await tx.relationship.findFirst({
        where: {
          relationshipTypeId: rel.relationshipTypeId,
          fromEntityId: rel.fromEntityId,
          toEntityId: survivorId,
        },
      });
      if (existing) {
        await tx.relationship.delete({ where: { id: rel.id } });
      } else {
        await tx.relationship.update({
          where: { id: rel.id },
          data: { toEntityId: survivorId },
        });
      }
    }

    // 3. Update ContentChunks
    await tx.contentChunk.updateMany({
      where: { entityId: absorbedId },
      data: { entityId: survivorId },
    });

    // 4. Update ActivitySignals — actorEntityId
    await tx.activitySignal.updateMany({
      where: { actorEntityId: absorbedId },
      data: { actorEntityId: survivorId },
    });

    // 4b. Update ActivitySignals — targetEntityIds (JSON array)
    const signalsWithTarget = await tx.activitySignal.findMany({
      where: {
        targetEntityIds: { contains: absorbedId },
      },
      select: { id: true, targetEntityIds: true },
    });
    for (const sig of signalsWithTarget) {
      if (!sig.targetEntityIds) continue;
      try {
        const ids = JSON.parse(sig.targetEntityIds) as string[];
        const updated = ids.map((id) => (id === absorbedId ? survivorId : id));
        await tx.activitySignal.update({
          where: { id: sig.id },
          data: { targetEntityIds: JSON.stringify(updated) },
        });
      } catch {
        // Malformed JSON — skip
      }
    }

    // 5. Mark absorbed entity
    await tx.entity.update({
      where: { id: absorbedId },
      data: {
        status: "merged",
        mergedIntoId: survivorId,
      },
    });

    // 6. Create EntityMergeLog
    await tx.entityMergeLog.create({
      data: {
        operatorId,
        survivorId,
        absorbedId,
        mergeType,
        confidence: confidence ?? null,
        signals: signals ? JSON.stringify(signals) : null,
        snapshot: JSON.stringify(snapshot),
        reversible: true,
      },
    });
  });

  // 7. Update survivor embedding (outside transaction — non-critical)
  try {
    await updateEntityEmbedding(survivorId);
  } catch (err) {
    console.warn("[identity-resolution] Failed to update survivor embedding:", err);
  }
}

// ── 3b. Reverse merge ───────────────────────────────────────────────────────

export async function reverseMerge(mergeLogId: string): Promise<void> {
  const log = await prisma.entityMergeLog.findUnique({
    where: { id: mergeLogId },
  });

  if (!log) throw new Error("Merge log entry not found");
  if (!log.reversible) throw new Error("This merge is not reversible");
  if (log.reversedAt) throw new Error("This merge has already been reversed");
  if (!log.snapshot) throw new Error("No snapshot available for reversal");

  const snapshot: AbsorbedSnapshot = JSON.parse(log.snapshot);

  await prisma.$transaction(async (tx) => {
    // 1. Restore absorbed entity status
    await tx.entity.update({
      where: { id: log.absorbedId },
      data: {
        status: snapshot.status,
        mergedIntoId: snapshot.mergedIntoId,
      },
    });

    // 2. Restore property values — remove ones that were added during merge
    // Properties from snapshot that weren't on the survivor before merge
    for (const pv of snapshot.propertyValues) {
      // Check if this property was copied to survivor during merge
      const onSurvivor = await tx.propertyValue.findFirst({
        where: { entityId: log.survivorId, propertyId: pv.propertyId },
      });
      if (onSurvivor) {
        // If absorbed originally had this property, move it back
        await tx.propertyValue.upsert({
          where: { entityId_propertyId: { entityId: log.absorbedId, propertyId: pv.propertyId } },
          create: { entityId: log.absorbedId, propertyId: pv.propertyId, value: pv.value },
          update: { value: pv.value },
        });

        // If this was an additive copy (didn't exist on survivor before), remove from survivor
        // We know it was additive if the absorbed entity owned it in the snapshot
        // and the survivor has it now. To be safe, only remove if values match.
        if (onSurvivor.value === pv.value) {
          await tx.propertyValue.delete({ where: { id: onSurvivor.id } });
        }
      } else {
        // Property no longer on survivor — just restore on absorbed
        await tx.propertyValue.upsert({
          where: { entityId_propertyId: { entityId: log.absorbedId, propertyId: pv.propertyId } },
          create: { entityId: log.absorbedId, propertyId: pv.propertyId, value: pv.value },
          update: { value: pv.value },
        });
      }
    }

    // 3. Restore relationships from snapshot
    for (const rel of snapshot.fromRelationships) {
      // Check if this was redirected (now points from survivor)
      const redirected = await tx.relationship.findFirst({
        where: {
          relationshipTypeId: rel.relationshipTypeId,
          fromEntityId: log.survivorId,
          toEntityId: rel.toEntityId,
        },
      });
      if (redirected) {
        await tx.relationship.update({
          where: { id: redirected.id },
          data: { fromEntityId: log.absorbedId },
        });
      } else {
        // Re-create it
        await tx.relationship.create({
          data: {
            relationshipTypeId: rel.relationshipTypeId,
            fromEntityId: log.absorbedId,
            toEntityId: rel.toEntityId,
            metadata: rel.metadata,
          },
        }).catch(() => {
          // Duplicate — skip
        });
      }
    }

    for (const rel of snapshot.toRelationships) {
      const redirected = await tx.relationship.findFirst({
        where: {
          relationshipTypeId: rel.relationshipTypeId,
          fromEntityId: rel.fromEntityId,
          toEntityId: log.survivorId,
        },
      });
      if (redirected) {
        await tx.relationship.update({
          where: { id: redirected.id },
          data: { toEntityId: log.absorbedId },
        });
      } else {
        await tx.relationship.create({
          data: {
            relationshipTypeId: rel.relationshipTypeId,
            fromEntityId: rel.fromEntityId,
            toEntityId: log.absorbedId,
            metadata: rel.metadata,
          },
        }).catch(() => {
          // Duplicate — skip
        });
      }
    }

    // 4. Revert ContentChunks
    // We can't perfectly distinguish which chunks were redirected vs originally survivor's,
    // but snapshot captures the absorbed entity's state before merge.
    // Conservative: any chunk pointing to survivor that was created before the merge
    // and might have been absorbed's — we leave them. The snapshot doesn't track chunk IDs.
    // For simplicity, leave ContentChunks as-is (minor data denormalization).

    // 5. Revert ActivitySignals — actorEntityId
    // Same conservative approach: we don't track which signals were redirected.
    // Leave as-is.

    // 6. Mark merge log as reversed
    await tx.entityMergeLog.update({
      where: { id: mergeLogId },
      data: { reversedAt: new Date() },
    });
  });

  // Update embeddings for both entities
  try {
    await updateEntityEmbedding(log.survivorId);
    await updateEntityEmbedding(log.absorbedId);
  } catch (err) {
    console.warn("[identity-resolution] Failed to update embeddings after reversal:", err);
  }
}

// ── 4. Resolution runner ────────────────────────────────────────────────────

export async function runIdentityResolution(
  operatorId: string,
  entityIds?: string[],
): Promise<{ autoMerged: number; suggested: number }> {
  let idsToProcess: string[];

  if (entityIds?.length) {
    idsToProcess = entityIds;
  } else {
    const entities = await prisma.entity.findMany({
      where: { operatorId, status: { not: "merged" } },
      select: { id: true },
    });
    idsToProcess = entities.map((e) => e.id);
  }

  let autoMerged = 0;
  let suggested = 0;
  const alreadyMerged = new Set<string>();

  for (const entityId of idsToProcess) {
    // Skip if this entity was already merged during this run
    if (alreadyMerged.has(entityId)) continue;

    // Check entity still exists and is active
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, status: true },
    });
    if (!entity || entity.status === "merged") continue;

    // Ensure embedding exists
    const hasEmbedding = await prisma.$queryRawUnsafe<Array<{ has: boolean }>>(
      `SELECT ("entityEmbedding" IS NOT NULL) as has FROM "Entity" WHERE id = $1`,
      entityId,
    );
    if (!hasEmbedding.length || !hasEmbedding[0].has) {
      await updateEntityEmbedding(entityId);
    }

    const candidates = await findMergeCandidates(entityId, operatorId);

    for (const candidate of candidates) {
      if (alreadyMerged.has(candidate.entityId)) continue;

      if (candidate.classification === "auto_merge") {
        // Determine survivor/absorbed
        const { survivorId, absorbedId } = await determineSurvivor(
          operatorId,
          entityId,
          candidate.entityId,
        );

        try {
          await mergeEntities(
            operatorId,
            survivorId,
            absorbedId,
            "ml_high_confidence",
            candidate.score,
            candidate.signals,
          );
          alreadyMerged.add(absorbedId);
          autoMerged++;
          console.log(
            `[identity-resolution] Auto-merged: "${candidate.displayName}" → survivor (score=${candidate.score.toFixed(2)})`,
          );
        } catch (err) {
          console.error(`[identity-resolution] Merge failed for ${entityId} + ${candidate.entityId}:`, err);
        }

        // Only auto-merge the top candidate per entity
        break;
      } else {
        // Suggestion — store for admin review
        await prisma.entityMergeLog.create({
          data: {
            operatorId,
            survivorId: entityId,
            absorbedId: candidate.entityId,
            mergeType: "ml_suggestion",
            confidence: candidate.score,
            signals: JSON.stringify(candidate.signals),
            reversible: false, // not executed yet
          },
        });
        suggested++;
      }
    }
  }

  return { autoMerged, suggested };
}
