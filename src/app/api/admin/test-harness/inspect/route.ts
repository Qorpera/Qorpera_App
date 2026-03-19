import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperadmin, getOperatorId, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSuperadmin();
    const operatorId = getOperatorId(req, session.operatorId);
    const layer = req.nextUrl.searchParams.get("layer");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);

    if (!layer) {
      return NextResponse.json({
        error: "Missing 'layer' query param",
        validLayers: ["content-chunks", "activity-signals", "situations", "entities", "notifications", "personal-autonomy", "situation-types"],
      }, { status: 400 });
    }

    switch (layer) {
      // ── Content Chunks ──────────────────────────────────────────────────
      case "content-chunks": {
        const chunks = await prisma.contentChunk.findMany({
          where: { operatorId },
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            entityId: true,
            departmentIds: true,
            metadata: true,
            content: true,
            chunkIndex: true,
            tokenCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        // Check embeddings via raw query
        const chunkIds = chunks.map((c) => c.id);
        let embeddingStatus: Array<{ id: string; hasEmbedding: boolean }> = [];
        if (chunkIds.length > 0) {
          embeddingStatus = await prisma.$queryRaw<Array<{ id: string; hasEmbedding: boolean }>>`
            SELECT id, (embedding IS NOT NULL) as "hasEmbedding"
            FROM "ContentChunk"
            WHERE id = ANY(${chunkIds}::text[])
          `;
        }
        const embeddingMap = new Map(embeddingStatus.map((e) => [e.id, e.hasEmbedding]));

        return NextResponse.json({
          layer: "content-chunks",
          operatorId,
          count: chunks.length,
          items: chunks.map((c) => ({
            id: c.id,
            sourceType: c.sourceType,
            sourceId: c.sourceId,
            entityId: c.entityId,
            departmentIds: c.departmentIds ? safeParseJSON(c.departmentIds) : null,
            metadata: c.metadata ? safeParseJSON(c.metadata) : null,
            contentPreview: c.content.slice(0, 200),
            chunkIndex: c.chunkIndex,
            tokenCount: c.tokenCount,
            hasEmbedding: embeddingMap.get(c.id) ?? false,
            createdAt: formatTimestamp(c.createdAt),
          })),
        });
      }

      // ── Activity Signals ────────────────────────────────────────────────
      case "activity-signals": {
        const signals = await prisma.activitySignal.findMany({
          where: { operatorId },
          orderBy: { occurredAt: "desc" },
          take: limit,
        });

        // Resolve actor entity names
        const actorIds = [...new Set(signals.map((s) => s.actorEntityId).filter(Boolean))] as string[];
        const actorEntities = actorIds.length > 0
          ? await prisma.entity.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, displayName: true },
            })
          : [];
        const actorMap = new Map(actorEntities.map((e) => [e.id, e.displayName]));

        // Resolve target entity names
        const allTargetIds = new Set<string>();
        for (const s of signals) {
          if (s.targetEntityIds) {
            try {
              const ids = JSON.parse(s.targetEntityIds) as string[];
              ids.forEach((id) => allTargetIds.add(id));
            } catch {}
          }
        }
        const targetEntities = allTargetIds.size > 0
          ? await prisma.entity.findMany({
              where: { id: { in: [...allTargetIds] } },
              select: { id: true, displayName: true },
            })
          : [];
        const targetMap = new Map(targetEntities.map((e) => [e.id, e.displayName]));

        return NextResponse.json({
          layer: "activity-signals",
          operatorId,
          count: signals.length,
          items: signals.map((s) => {
            const targetIds = s.targetEntityIds ? (safeParseJSON(s.targetEntityIds) as string[]) : [];
            return {
              id: s.id,
              signalType: s.signalType,
              actorEntityId: s.actorEntityId,
              actorName: s.actorEntityId ? actorMap.get(s.actorEntityId) ?? null : null,
              targets: Array.isArray(targetIds)
                ? targetIds.map((id: string) => ({ id, name: targetMap.get(id) ?? null }))
                : [],
              departmentIds: s.departmentIds ? safeParseJSON(s.departmentIds) : null,
              metadata: s.metadata ? safeParseJSON(s.metadata) : null,
              occurredAt: formatTimestamp(s.occurredAt),
            };
          }),
        });
      }

      // ── Situations ──────────────────────────────────────────────────────
      case "situations": {
        const situations = await prisma.situation.findMany({
          where: { operatorId },
          include: {
            situationType: { select: { name: true, autonomyLevel: true, scopeEntityId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        // Resolve trigger entity names
        const triggerIds = [...new Set(situations.map((s) => s.triggerEntityId).filter(Boolean))] as string[];
        const triggerEntities = triggerIds.length > 0
          ? await prisma.entity.findMany({
              where: { id: { in: triggerIds } },
              select: { id: true, displayName: true, entityType: { select: { slug: true } } },
            })
          : [];
        const triggerMap = new Map(triggerEntities.map((e) => [e.id, e]));

        // Resolve department names for scope
        const deptIds = [...new Set(situations.map((s) => s.situationType.scopeEntityId).filter(Boolean))] as string[];
        const deptEntities = deptIds.length > 0
          ? await prisma.entity.findMany({
              where: { id: { in: deptIds } },
              select: { id: true, displayName: true },
            })
          : [];
        const deptMap = new Map(deptEntities.map((e) => [e.id, e.displayName]));

        return NextResponse.json({
          layer: "situations",
          operatorId,
          count: situations.length,
          items: situations.map((s) => {
            const trigger = s.triggerEntityId ? triggerMap.get(s.triggerEntityId) : null;
            let reasoningSummary = null;
            if (s.reasoning) {
              try {
                const r = JSON.parse(s.reasoning);
                reasoningSummary = {
                  analysis: r.analysis?.slice(0, 200) ?? null,
                  chosenAction: r.actionPlan?.[0]?.actionCapabilityName ?? null,
                  confidence: r.confidence ?? null,
                  isMultiAgent: !!r._multiAgent,
                };
              } catch {}
            }
            return {
              id: s.id,
              status: s.status,
              source: s.source,
              triggerEntity: trigger
                ? { id: trigger.id, displayName: trigger.displayName, type: trigger.entityType.slug }
                : null,
              situationType: {
                name: s.situationType.name,
                autonomyLevel: s.situationType.autonomyLevel,
              },
              department: s.situationType.scopeEntityId
                ? deptMap.get(s.situationType.scopeEntityId) ?? null
                : null,
              severity: s.severity,
              confidence: s.confidence,
              reasoning: reasoningSummary,
              feedback: s.feedback,
              feedbackRating: s.feedbackRating,
              createdAt: formatTimestamp(s.createdAt),
              resolvedAt: s.resolvedAt ? formatTimestamp(s.resolvedAt) : null,
            };
          }),
        });
      }

      // ── Entities ────────────────────────────────────────────────────────
      case "entities": {
        const includeMerged = req.nextUrl.searchParams.get("includeMerged") === "true";
        const statusFilter = includeMerged ? {} : { status: { not: "merged" } };

        const entities = await prisma.entity.findMany({
          where: { operatorId, ...statusFilter },
          select: {
            id: true,
            displayName: true,
            category: true,
            status: true,
            sourceSystem: true,
            mergedIntoId: true,
            parentDepartmentId: true,
            entityType: { select: { slug: true } },
            _count: { select: { propertyValues: true, fromRelations: true, toRelations: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        });

        // Check entity embeddings via raw query
        const entityIds = entities.map((e) => e.id);
        let embeddingStatus: Array<{ id: string; hasEmbedding: boolean }> = [];
        if (entityIds.length > 0) {
          embeddingStatus = await prisma.$queryRaw<Array<{ id: string; hasEmbedding: boolean }>>`
            SELECT id, ("entityEmbedding" IS NOT NULL) as "hasEmbedding"
            FROM "Entity"
            WHERE id = ANY(${entityIds}::text[])
          `;
        }
        const embeddingMap = new Map(embeddingStatus.map((e) => [e.id, e.hasEmbedding]));

        // Resolve department names
        const deptIds = [...new Set(entities.map((e) => e.parentDepartmentId).filter(Boolean))] as string[];
        const depts = deptIds.length > 0
          ? await prisma.entity.findMany({
              where: { id: { in: deptIds } },
              select: { id: true, displayName: true },
            })
          : [];
        const deptNameMap = new Map(depts.map((d) => [d.id, d.displayName]));

        return NextResponse.json({
          layer: "entities",
          operatorId,
          count: entities.length,
          items: entities.map((e) => ({
            id: e.id,
            displayName: e.displayName,
            entityType: e.entityType.slug,
            category: e.category,
            status: e.status,
            sourceSystem: e.sourceSystem,
            mergedIntoId: e.mergedIntoId,
            parentDepartment: e.parentDepartmentId
              ? { id: e.parentDepartmentId, name: deptNameMap.get(e.parentDepartmentId) ?? null }
              : null,
            propertyCount: e._count.propertyValues,
            relationshipCount: e._count.fromRelations + e._count.toRelations,
            hasEmbedding: embeddingMap.get(e.id) ?? false,
          })),
        });
      }

      // ── Notifications ───────────────────────────────────────────────────
      case "notifications": {
        const notifications = await prisma.notification.findMany({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        return NextResponse.json({
          layer: "notifications",
          operatorId,
          count: notifications.length,
          items: notifications.map((n) => ({
            id: n.id,
            sourceType: n.sourceType,
            title: n.title,
            body: n.body,
            sourceId: n.sourceId,
            read: n.read,
            createdAt: formatTimestamp(n.createdAt),
          })),
        });
      }

      // ── Personal Autonomy ───────────────────────────────────────────────
      case "personal-autonomy": {
        const autonomies = await prisma.personalAutonomy.findMany({
          where: { operatorId },
          include: {
            aiEntity: {
              select: {
                id: true,
                displayName: true,
                ownerUserId: true,
              },
            },
            situationType: {
              select: { name: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        });

        // Resolve owner user names
        const ownerIds = [...new Set(autonomies.map((a) => a.aiEntity.ownerUserId).filter(Boolean))] as string[];
        const owners = ownerIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true },
            })
          : [];
        const ownerMap = new Map(owners.map((u) => [u.id, u.name]));

        // Group by AI entity
        const grouped = new Map<string, {
          aiEntityId: string;
          aiEntityName: string;
          ownerName: string | null;
          types: Array<{
            situationType: string;
            autonomyLevel: string;
            consecutiveApprovals: number;
            totalProposed: number;
            totalApproved: number;
            approvalRate: number;
          }>;
        }>();

        for (const a of autonomies) {
          const key = a.aiEntity.id;
          if (!grouped.has(key)) {
            grouped.set(key, {
              aiEntityId: a.aiEntity.id,
              aiEntityName: a.aiEntity.displayName,
              ownerName: a.aiEntity.ownerUserId ? ownerMap.get(a.aiEntity.ownerUserId) ?? null : null,
              types: [],
            });
          }
          grouped.get(key)!.types.push({
            situationType: a.situationType.name,
            autonomyLevel: a.autonomyLevel,
            consecutiveApprovals: a.consecutiveApprovals,
            totalProposed: a.totalProposed,
            totalApproved: a.totalApproved,
            approvalRate: a.approvalRate,
          });
        }

        return NextResponse.json({
          layer: "personal-autonomy",
          operatorId,
          count: autonomies.length,
          aiEntities: [...grouped.values()],
        });
      }

      // ── Situation Types ─────────────────────────────────────────────────
      case "situation-types": {
        const types = await prisma.situationType.findMany({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
        });

        // Resolve scope entity names
        const scopeIds = [...new Set(types.map((t) => t.scopeEntityId).filter(Boolean))] as string[];
        const scopeEntities = scopeIds.length > 0
          ? await prisma.entity.findMany({
              where: { id: { in: scopeIds } },
              select: { id: true, displayName: true },
            })
          : [];
        const scopeMap = new Map(scopeEntities.map((e) => [e.id, e.displayName]));

        return NextResponse.json({
          layer: "situation-types",
          operatorId,
          count: types.length,
          items: types.map((t) => {
            let mode = "unknown";
            try {
              const dl = JSON.parse(t.detectionLogic);
              mode = dl.mode ?? "unknown";
            } catch {}
            return {
              id: t.id,
              slug: t.slug,
              name: t.name,
              description: t.description,
              mode,
              autonomyLevel: t.autonomyLevel,
              department: t.scopeEntityId ? scopeMap.get(t.scopeEntityId) ?? null : null,
              enabled: t.enabled,
              totalProposed: t.totalProposed,
              totalApproved: t.totalApproved,
              approvalRate: t.approvalRate,
              consecutiveApprovals: t.consecutiveApprovals,
              preFilterPassCount: t.preFilterPassCount,
              llmConfirmCount: t.llmConfirmCount,
              auditMissCount: t.auditMissCount,
              lastAuditAt: t.lastAuditAt ? formatTimestamp(t.lastAuditAt) : null,
            };
          }),
        });
      }

      default:
        return NextResponse.json({
          error: `Unknown layer: ${layer}`,
          validLayers: ["content-chunks", "activity-signals", "situations", "entities", "notifications", "personal-autonomy", "situation-types"],
        }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[test-harness/inspect]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
