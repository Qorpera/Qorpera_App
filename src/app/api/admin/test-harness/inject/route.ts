import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestContent } from "@/lib/content-pipeline";
import { requireSuperadmin, getOperatorIdFromBody, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperadmin();
    const body = await req.json();
    const operatorId = getOperatorIdFromBody(body, session.operatorId);
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ error: "Missing 'type' and 'data' fields" }, { status: 400 });
    }

    switch (type) {
      case "content": {
        const { sourceType, sourceId, text, entityId, departmentIds, metadata } = data;
        if (!sourceType || !sourceId || !text) {
          return NextResponse.json(
            { error: "Content injection requires: sourceType, sourceId, text" },
            { status: 400 },
          );
        }
        if (!departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
          return NextResponse.json(
            { error: "Content injection requires departmentIds (non-empty array)" },
            { status: 400 },
          );
        }

        const result = await ingestContent({
          operatorId,
          sourceType,
          sourceId,
          content: text,
          entityId: entityId ?? undefined,
          departmentIds,
          metadata: metadata ?? {},
        });

        // Fetch created chunk IDs
        const chunks = await prisma.contentChunk.findMany({
          where: { operatorId, sourceType, sourceId },
          select: { id: true, chunkIndex: true },
          orderBy: { chunkIndex: "asc" },
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
          success: true,
          type: "content",
          chunksCreated: result.chunksCreated,
          chunks: chunks.map((c) => ({
            id: c.id,
            chunkIndex: c.chunkIndex,
            hasEmbedding: embeddingMap.get(c.id) ?? false,
          })),
          timestamp: formatTimestamp(new Date()),
        });
      }

      case "activity": {
        const { signalType, actorEntityId, targetEntityIds, departmentIds, metadata, occurredAt } = data;
        if (!signalType) {
          return NextResponse.json({ error: "Activity injection requires: signalType" }, { status: 400 });
        }
        if (!departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
          return NextResponse.json(
            { error: "Activity injection requires departmentIds (non-empty array)" },
            { status: 400 },
          );
        }

        const signal = await prisma.activitySignal.create({
          data: {
            operatorId,
            signalType,
            actorEntityId: actorEntityId ?? null,
            targetEntityIds: targetEntityIds ? JSON.stringify(targetEntityIds) : null,
            departmentIds: JSON.stringify(departmentIds),
            metadata: metadata ? JSON.stringify(metadata) : null,
            occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          type: "activity",
          activitySignal: {
            id: signal.id,
            signalType: signal.signalType,
            actorEntityId: signal.actorEntityId,
            occurredAt: formatTimestamp(signal.occurredAt),
          },
          timestamp: formatTimestamp(new Date()),
        });
      }

      case "event": {
        const { connectorId, eventType, sourceSystem, payload } = data;
        if (!connectorId || !eventType || !sourceSystem || !payload) {
          return NextResponse.json(
            { error: "Event injection requires: connectorId, eventType, sourceSystem, payload" },
            { status: 400 },
          );
        }

        // Verify connector belongs to operator
        const connector = await prisma.sourceConnector.findFirst({
          where: { id: connectorId, operatorId, deletedAt: null },
          select: { id: true },
        });
        if (!connector) {
          return NextResponse.json(
            { error: `Connector ${connectorId} not found for operator ${operatorId}` },
            { status: 404 },
          );
        }

        const event = await prisma.event.create({
          data: {
            operatorId,
            connectorId,
            source: sourceSystem,
            eventType,
            payload: JSON.stringify(payload),
          },
        });

        return NextResponse.json({
          success: true,
          type: "event",
          event: {
            id: event.id,
            source: event.source,
            eventType: event.eventType,
            processedAt: event.processedAt,
            createdAt: formatTimestamp(event.createdAt),
          },
          note: "Event created but NOT materialized. Use /trigger with pipeline='materialization' to process it.",
          timestamp: formatTimestamp(new Date()),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown injection type: ${type}. Must be 'content', 'activity', or 'event'.` },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[test-harness/inject]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
