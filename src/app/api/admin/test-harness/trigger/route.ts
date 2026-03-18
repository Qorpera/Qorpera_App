import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectSituations } from "@/lib/situation-detector";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { assembleSituationContext } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { runIdentityResolution, runDeterministicMerges } from "@/lib/identity-resolution";
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
      // ── Detection ───────────────────────────────────────────────────────
      case "detection": {
        const before = await prisma.situation.count({ where: { operatorId } });
        const results = await detectSituations(operatorId);
        const after = await prisma.situation.count({ where: { operatorId } });

        return NextResponse.json({
          pipeline: "detection",
          operatorId,
          situationsCreatedCount: after - before,
          detectionResults: results.map((r) => ({
            situationId: r.situationId,
            situationTypeId: r.situationTypeId,
            situationTypeName: r.situationTypeName,
            entityId: r.entityId,
            entityDisplayName: r.entityDisplayName,
            confidence: r.confidence,
            detectedBy: r.detectedBy,
          })),
          timestamp: formatTimestamp(new Date()),
        });
      }

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
            departmentIds: true,
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

      // ── Context Assembly ────────────────────────────────────────────────
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

        const context = await assembleSituationContext(
          operatorId,
          situation.situationTypeId,
          situation.triggerEntityId ?? "",
          situation.triggerEventId ?? undefined,
        );

        return NextResponse.json({
          pipeline: "context-assembly",
          operatorId,
          situationId,
          triggerEntity: {
            id: context.triggerEntity.id,
            displayName: context.triggerEntity.displayName,
            type: context.triggerEntity.type,
            category: context.triggerEntity.category,
            propertyCount: Object.keys(context.triggerEntity.properties).length,
          },
          departments: context.departments.map((d) => ({
            id: d.id,
            name: d.name,
            memberCount: d.memberCount,
          })),
          relatedEntities: {
            base: context.relatedEntities.base.length,
            digital: context.relatedEntities.digital.length,
            external: context.relatedEntities.external.length,
          },
          recentEvents: context.recentEvents.length,
          priorSituations: context.priorSituations.length,
          departmentKnowledge: context.departmentKnowledge.length,
          activityTimeline: {
            bucketCount: context.activityTimeline.buckets.length,
            totalSignals: context.activityTimeline.totalSignals,
            trend: context.activityTimeline.trend,
          },
          communicationContext: {
            excerptCount: context.communicationContext.excerpts.length,
            sourceBreakdown: context.communicationContext.sourceBreakdown,
          },
          crossDepartmentSignals: context.crossDepartmentSignals.signals.length,
          contextSections: context.contextSections,
          totalEstimatedTokens: context.contextSections.reduce((s, c) => s + c.tokenEstimate, 0),
          // Full context for deep inspection
          fullContext: context,
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Reasoning (dry-run) ─────────────────────────────────────────────
      case "reasoning": {
        const situationId = params?.situationId;
        if (!situationId) {
          return NextResponse.json({ error: "reasoning requires params.situationId" }, { status: 400 });
        }

        const situation = await prisma.situation.findFirst({
          where: { id: situationId, operatorId },
          include: { situationType: true },
        });
        if (!situation) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        // The production reasonAboutSituation() has side effects (status update, notifications).
        // For dry-run, we replicate the pipeline steps manually without persisting.
        const { assembleSituationContext: assembleCtx } = await import("@/lib/context-assembly");
        const { buildReasoningSystemPrompt, buildReasoningUserPrompt } = await import("@/lib/reasoning-prompts");
        const { callLLM } = await import("@/lib/ai-provider");
        const { getBusinessContext, formatBusinessContext } = await import("@/lib/business-context");
        const { shouldUseMultiAgent, runMultiAgentReasoning } = await import("@/lib/multi-agent-reasoning");
        const { ReasoningOutputSchema } = await import("@/lib/reasoning-types");

        // Assemble context
        const context = await assembleCtx(
          operatorId,
          situation.situationTypeId,
          situation.triggerEntityId ?? "",
          situation.triggerEventId ?? undefined,
        );

        // Resolve governance
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

        const effectiveAutonomy = getEffectiveAutonomy(situation.situationType, policyResult);

        const [businessCtx, operator] = await Promise.all([
          getBusinessContext(operatorId),
          prisma.operator.findUnique({ where: { id: operatorId }, select: { companyName: true } }),
        ]);
        const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

        const reasoningInput = {
          situationType: {
            name: situation.situationType.name,
            description: situation.situationType.description,
            autonomyLevel: effectiveAutonomy,
          },
          severity: situation.severity,
          confidence: situation.confidence,
          triggerEntity: {
            displayName: context.triggerEntity.displayName,
            type: context.triggerEntity.type,
            category: context.triggerEntity.category,
            properties: context.triggerEntity.properties,
          },
          departments: context.departments,
          departmentKnowledge: context.departmentKnowledge,
          relatedEntities: context.relatedEntities,
          recentEvents: context.recentEvents.map((e) => ({
            type: e.eventType,
            timestamp: e.createdAt,
            payload: e.payload,
          })),
          priorSituations: [],
          autonomyLevel: effectiveAutonomy,
          permittedActions: policyResult.permitted,
          blockedActions: policyResult.blocked,
          businessContext: businessContextStr,
          activityTimeline: context.activityTimeline,
          communicationContext: context.communicationContext,
          crossDepartmentSignals: context.crossDepartmentSignals,
          connectorCapabilities: context.connectorCapabilities,
        };

        const useMultiAgent = shouldUseMultiAgent(context.contextSections);
        let reasoningOutput = null;
        let multiAgentFindings = null;
        let reasoningPath = "single-pass";
        let rawResponse = "";

        if (useMultiAgent) {
          reasoningPath = "multi-agent";
          const result = await runMultiAgentReasoning(
            reasoningInput,
            context.contextSections,
            operator?.companyName ?? undefined,
          );
          reasoningOutput = result.coordinatorReasoning;
          multiAgentFindings = result.findings;
        } else {
          const systemPrompt = buildReasoningSystemPrompt(businessContextStr, operator?.companyName ?? undefined);
          const userPrompt = buildReasoningUserPrompt(reasoningInput);

          const response = await callLLM(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            { temperature: 0.2, maxTokens: 4096, aiFunction: "reasoning" },
          );
          rawResponse = response.content;

          // Parse
          const fenceMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = fenceMatch ? fenceMatch[1].trim() : rawResponse.trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const result = ReasoningOutputSchema.safeParse(parsed);
            if (result.success) {
              reasoningOutput = result.data;
            } else {
              reasoningOutput = { raw: rawResponse, parseErrors: result.error.issues };
            }
          } catch {
            reasoningOutput = { raw: rawResponse, parseError: "Failed to parse JSON" };
          }
        }

        return NextResponse.json({
          pipeline: "reasoning",
          operatorId,
          situationId,
          dryRun: true,
          reasoningPath,
          estimatedTokens: context.contextSections.reduce((s, c) => s + c.tokenEstimate, 0),
          effectiveAutonomy,
          policyResult: {
            permitted: policyResult.permitted.map((p) => p.name),
            blocked: policyResult.blocked.map((b) => ({ name: b.name, reason: b.reason })),
            hasRequireApproval: policyResult.hasRequireApproval,
          },
          reasoningOutput,
          multiAgentFindings,
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Identity Resolution ─────────────────────────────────────────────
      case "identity-resolution": {
        const entityIds = params?.entityIds as string[] | undefined;

        // Phase 1: deterministic
        const deterministicResult = await runDeterministicMerges(operatorId, entityIds);

        // Phase 2: ML
        const mlResult = await runIdentityResolution(operatorId, entityIds);

        return NextResponse.json({
          pipeline: "identity-resolution",
          operatorId,
          scopedToEntityIds: entityIds ?? "all",
          deterministic: {
            mergesExecuted: deterministicResult.mergesExecuted,
            mergeLogIds: deterministicResult.mergeLogIds,
          },
          ml: {
            autoMerged: mlResult.autoMerged,
            suggested: mlResult.suggested,
          },
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

        const effectiveAutonomy = getEffectiveAutonomy(situation.situationType, policyResult);

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
          effectiveAutonomy,
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
          { error: `Unknown pipeline: ${pipeline}. Must be: detection, content-detection, context-assembly, reasoning, identity-resolution, policy-check` },
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
