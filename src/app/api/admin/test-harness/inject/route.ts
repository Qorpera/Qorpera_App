import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storeRawContent } from "@/lib/storage/raw-content-store";
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
        const { sourceType, sourceId, text, metadata } = data;
        if (!sourceType || !sourceId || !text) {
          return NextResponse.json(
            { error: "Content injection requires: sourceType, sourceId, text" },
            { status: 400 },
          );
        }

        await storeRawContent({
          operatorId,
          accountId: "test-harness",
          sourceType,
          sourceId,
          content: text,
          metadata: metadata ?? {},
          occurredAt: new Date(),
        });

        return NextResponse.json({
          success: true,
          type: "content",
          stored: true,
          sourceType,
          sourceId,
          timestamp: formatTimestamp(new Date()),
        });
      }

      case "activity": {
        // ActivitySignal table has been removed — return a no-op response
        return NextResponse.json({
          success: true,
          type: "activity",
          activitySignal: null,
          note: "ActivitySignal table has been removed. Activity injection is a no-op.",
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
