import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperadmin, getOperatorId, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSuperadmin();
    const operatorId = getOperatorId(req, session.operatorId);
    const layer = req.nextUrl.searchParams.get("layer");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);

    if (!layer) {
      return NextResponse.json({
        error: "Missing 'layer' query param",
        validLayers: ["content-chunks", "activity-signals", "situations", "entities", "notifications", "situation-types"],
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
            domainIds: true,
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
            domainIds: c.domainIds ? safeParseJSON(c.domainIds) : null,
            metadata: c.metadata ? safeParseJSON(c.metadata) : null,
            contentPreview: c.content.slice(0, 200),
            chunkIndex: c.chunkIndex,
            tokenCount: c.tokenCount,
            hasEmbedding: embeddingMap.get(c.id) ?? false,
            createdAt: formatTimestamp(c.createdAt),
          })),
        });
      }

      // ── Activity Signals (table removed) ────────────────────────────────
      case "activity-signals": {
        return NextResponse.json({
          layer: "activity-signals",
          operatorId,
          count: 0,
          items: [],
          note: "ActivitySignal table has been removed.",
        });
      }

      // ── Situations (from KnowledgePage) ─────────────────────────────────
      case "situations": {
        const sitPages = await prisma.knowledgePage.findMany({
          where: { operatorId, pageType: "situation_instance", scope: "operator" },
          select: { slug: true, title: true, properties: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        return NextResponse.json({
          layer: "situations",
          operatorId,
          count: sitPages.length,
          items: sitPages.map((p) => {
            const props = p.properties as Record<string, unknown> | null ?? {};
            return {
              id: (props?.situation_id as string) ?? p.slug,
              status: (props?.status as string) ?? "unknown",
              source: (props?.source as string) ?? null,
              triggerEntity: null,
              situationType: {
                name: (props?.situation_type as string) ?? "unknown",
                autonomyLevel: (props?.autonomy_level as string) ?? "supervised",
              },
              department: (props?.domain as string) ?? null,
              severity: (props?.severity as number) ?? 0,
              confidence: (props?.confidence as number) ?? 0,
              reasoning: null,
              feedback: null,
              feedbackRating: null,
              createdAt: formatTimestamp(p.createdAt),
              resolvedAt: props?.resolved_at ? String(props.resolved_at) : null,
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
            primaryDomainId: true,
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
        const deptIds = [...new Set(entities.map((e) => e.primaryDomainId).filter(Boolean))] as string[];
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
            primaryDomain: e.primaryDomainId
              ? { id: e.primaryDomainId, name: deptNameMap.get(e.primaryDomainId) ?? null }
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
          validLayers: ["content-chunks", "activity-signals", "situations", "entities", "notifications", "situation-types"],
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
