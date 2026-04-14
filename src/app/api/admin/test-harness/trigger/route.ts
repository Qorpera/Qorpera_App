import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import { requireSuperadmin, getOperatorIdFromBody, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperadmin();
    const body = await req.json();
    const operatorId = getOperatorIdFromBody(body, session.operatorId);
    const { pipeline, params } = body;

    if (!pipeline) {
      return NextResponse.json({ error: "Missing 'pipeline' field" }, { status: 400 });
    }

    switch (pipeline) {
      // ── Content Detection ───────────────────────────────────────────────
      case "content-detection": {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentChunks = await prisma.contentChunk.findMany({
          where: {
            operatorId,
            sourceType: { in: ["email", "slack_message", "teams_message"] },
            createdAt: { gte: oneHourAgo },
          },
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            content: true,
            metadata: true,
            domainIds: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });

        if (recentChunks.length === 0) {
          return NextResponse.json({
            pipeline: "content-detection",
            operatorId,
            message: "No recent communication content chunks found (last hour). Inject content first.",
            situationsCreated: [],
            timestamp: formatTimestamp(new Date()),
          });
        }

        // Build CommunicationItems from chunks
        const items: CommunicationItem[] = [];
        for (const chunk of recentChunks) {
          const meta = chunk.metadata ? JSON.parse(chunk.metadata) : {};
          const item = {
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId,
            content: chunk.content,
            metadata: meta,
            participantEmails: extractParticipantEmails(meta),
          };
          if (isEligibleCommunication(item)) {
            items.push(item);
          }
        }

        if (items.length === 0) {
          return NextResponse.json({
            pipeline: "content-detection",
            operatorId,
            message: "Found chunks but none are eligible communications (sent emails and automated messages are filtered).",
            chunksExamined: recentChunks.length,
            situationsCreated: [],
            timestamp: formatTimestamp(new Date()),
          });
        }

        // Snapshot situation count before
        const beforeCount = await prisma.situation.count({
          where: { operatorId, source: "content_detected" },
        });

        // Run the real content detection pipeline
        await evaluateContentForSituations(operatorId, items);

        // Find newly created situations
        const afterSituations = await prisma.situation.findMany({
          where: { operatorId, source: "content_detected", createdAt: { gte: oneHourAgo } },
          select: {
            id: true,
            status: true,
            triggerEntityId: true,
            confidence: true,
            contextSnapshot: true,
            situationType: { select: { name: true, slug: true } },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        const afterCount = await prisma.situation.count({
          where: { operatorId, source: "content_detected" },
        });

        return NextResponse.json({
          pipeline: "content-detection",
          operatorId,
          itemsEvaluated: items.length,
          newSituationsCreated: afterCount - beforeCount,
          situations: afterSituations.map((s) => {
            let snapshot: Record<string, unknown> = {};
            try { snapshot = s.contextSnapshot ? JSON.parse(s.contextSnapshot) : {}; } catch {}
            return {
              id: s.id,
              status: s.status,
              triggerEntityId: s.triggerEntityId,
              confidence: s.confidence,
              situationType: s.situationType.name,
              summary: (snapshot.currentSummary as string) ?? (snapshot.contentEvidence as Array<{ summary?: string }>)?.[0]?.summary ?? null,
              createdAt: formatTimestamp(s.createdAt),
            };
          }),
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Context Assembly (lightweight) ─────────────────────────────────
      case "context-assembly": {
        const situationId = params?.situationId;
        if (!situationId) {
          return NextResponse.json({ error: "context-assembly requires params.situationId" }, { status: 400 });
        }

        const situation = await prisma.situation.findFirst({
          where: { id: situationId, operatorId },
          select: { situationTypeId: true, triggerEntityId: true, triggerEventId: true },
        });
        if (!situation) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        // Lightweight entity context (same as production detector uses)
        const entity = situation.triggerEntityId
          ? await prisma.entity.findFirst({
              where: { id: situation.triggerEntityId, operatorId },
              include: {
                entityType: { select: { name: true } },
                propertyValues: { include: { property: { select: { slug: true } } } },
              },
            })
          : null;

        const properties: Record<string, string> = {};
        for (const pv of entity?.propertyValues ?? []) {
          properties[pv.property.slug] = pv.value;
        }

        return NextResponse.json({
          pipeline: "context-assembly",
          operatorId,
          situationId,
          triggerEntity: entity ? {
            id: entity.id,
            displayName: entity.displayName,
            type: entity.entityType.name,
            propertyCount: Object.keys(properties).length,
            properties,
          } : null,
          note: "Full context assembly removed — reasoning engine investigates via agentic tool-use loop",
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Reasoning (trigger production agentic loop) ───────────────────
      case "reasoning": {
        const situationId = params?.situationId;
        if (!situationId) {
          return NextResponse.json({ error: "reasoning requires params.situationId" }, { status: 400 });
        }

        const situation = await prisma.situation.findFirst({
          where: { id: situationId, operatorId },
          select: { id: true, status: true, investigationDepth: true },
        });
        if (!situation) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        // Reset to detected so the production reasoning engine picks it up
        if (situation.status !== "detected") {
          await prisma.situation.update({
            where: { id: situationId },
            data: { status: "detected" },
          });
        }

        const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
        const jobId = await enqueueWorkerJob("reason_situation", operatorId, { situationId });

        return NextResponse.json({
          pipeline: "reasoning",
          operatorId,
          situationId,
          investigationDepth: situation.investigationDepth,
          jobId,
          message: "Reasoning enqueued via production agentic loop",
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Policy Check ────────────────────────────────────────────────────
      case "policy-check": {
        const situationId = params?.situationId;
        if (!situationId) {
          return NextResponse.json({ error: "policy-check requires params.situationId" }, { status: 400 });
        }

        const situation = await prisma.situation.findFirst({
          where: { id: situationId, operatorId },
          include: { situationType: true },
        });
        if (!situation) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        let triggerEntityTypeSlug = "unknown";
        if (situation.triggerEntityId) {
          const entity = await prisma.entity.findUnique({
            where: { id: situation.triggerEntityId },
            include: { entityType: { select: { slug: true } } },
          });
          if (entity) triggerEntityTypeSlug = entity.entityType.slug;
        }

        const capabilities = await prisma.actionCapability.findMany({
          where: { operatorId, enabled: true },
          include: { connector: { select: { provider: true } } },
        });
        const actionsForEval = capabilities.map((c) => ({
          name: c.name,
          description: c.description,
          connectorId: c.connectorId,
          connectorProvider: c.connector?.provider ?? null,
          inputSchema: c.inputSchema,
        }));

        const policyResult = await evaluateActionPolicies(
          operatorId,
          actionsForEval,
          triggerEntityTypeSlug,
          situation.triggerEntityId ?? "",
        );

        // Load policies for detail
        const policies = await prisma.policyRule.findMany({
          where: { operatorId, enabled: true },
          select: { id: true, name: true, scope: true, effect: true, actionType: true },
        });

        return NextResponse.json({
          pipeline: "policy-check",
          operatorId,
          situationId,
          situationType: situation.situationType.name,
          triggerEntityTypeSlug,
          effectiveAutonomy: "supervised",
          permitted: policyResult.permitted.map((p) => ({
            name: p.name,
            description: p.description,
            connector: p.connector,
          })),
          blocked: policyResult.blocked,
          hasRequireApproval: policyResult.hasRequireApproval,
          activePolicies: policies,
          timestamp: formatTimestamp(new Date()),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown pipeline: ${pipeline}. Must be: content-detection, context-assembly, reasoning, policy-check` },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[test-harness/trigger]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractParticipantEmails(meta: Record<string, unknown>): string[] {
  const emails: string[] = [];
  if (typeof meta.from === "string") emails.push(meta.from);
  if (typeof meta.to === "string") emails.push(meta.to);
  if (Array.isArray(meta.to)) emails.push(...(meta.to as string[]));
  if (typeof meta.cc === "string") emails.push(meta.cc);
  if (Array.isArray(meta.cc)) emails.push(...(meta.cc as string[]));
  if (typeof meta.authorEmail === "string") emails.push(meta.authorEmail);
  return emails.filter(Boolean);
}
