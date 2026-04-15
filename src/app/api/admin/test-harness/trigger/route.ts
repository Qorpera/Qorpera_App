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

        // Snapshot situation page count before
        const beforeCount = await prisma.knowledgePage.count({
          where: { operatorId, pageType: "situation_instance", scope: "operator" },
        });

        // Run the real content detection pipeline
        await evaluateContentForSituations(operatorId, items);

        // Find newly created situation pages
        const afterSitPages = await prisma.knowledgePage.findMany({
          where: { operatorId, pageType: "situation_instance", scope: "operator", createdAt: { gte: oneHourAgo } },
          select: { slug: true, title: true, properties: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        const afterCount = await prisma.knowledgePage.count({
          where: { operatorId, pageType: "situation_instance", scope: "operator" },
        });

        return NextResponse.json({
          pipeline: "content-detection",
          operatorId,
          itemsEvaluated: items.length,
          newSituationsCreated: afterCount - beforeCount,
          situations: afterSitPages.map((p) => {
            const props = p.properties as Record<string, unknown> | null ?? {};
            return {
              id: (props?.situation_id as string) ?? p.slug,
              status: (props?.status as string) ?? "detected",
              triggerEntityId: null,
              confidence: (props?.confidence as number) ?? 0,
              situationType: (props?.situation_type as string) ?? "unknown",
              summary: p.title,
              createdAt: formatTimestamp(p.createdAt),
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

        // Look up situation from KnowledgePage
        const sitPages = await prisma.$queryRawUnsafe<Array<{
          properties: Record<string, unknown> | null;
        }>>(
          `SELECT properties FROM "KnowledgePage"
           WHERE "operatorId" = $1
             AND "pageType" = 'situation_instance'
             AND properties->>'situation_id' = $2
           LIMIT 1`,
          operatorId, situationId,
        );
        if (sitPages.length === 0) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        return NextResponse.json({
          pipeline: "context-assembly",
          operatorId,
          situationId,
          triggerEntity: null,
          note: "Full context assembly removed — reasoning engine investigates via agentic tool-use loop. Situation data now lives in KnowledgePage.",
          timestamp: formatTimestamp(new Date()),
        });
      }

      // ── Reasoning (trigger production agentic loop) ───────────────────
      case "reasoning": {
        const situationId = params?.situationId;
        if (!situationId) {
          return NextResponse.json({ error: "reasoning requires params.situationId" }, { status: 400 });
        }

        // Look up from KnowledgePage
        const reasonSitPages = await prisma.$queryRawUnsafe<Array<{
          slug: string; properties: Record<string, unknown> | null;
        }>>(
          `SELECT slug, properties FROM "KnowledgePage"
           WHERE "operatorId" = $1
             AND "pageType" = 'situation_instance'
             AND properties->>'situation_id' = $2
           LIMIT 1`,
          operatorId, situationId,
        );
        if (reasonSitPages.length === 0) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        const sitPage = reasonSitPages[0];
        const props = sitPage.properties ?? {};

        // Reset to detected via wiki page update
        if ((props.status as string) !== "detected") {
          const { updatePageWithLock } = await import("@/lib/wiki-engine");
          await updatePageWithLock(operatorId, sitPage.slug, (current) => ({
            properties: { ...(current.properties ?? {}), status: "detected" },
          }));
        }

        const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
        const jobId = await enqueueWorkerJob("reason_situation", operatorId, {
          situationId, wikiPageSlug: sitPage.slug,
        });

        return NextResponse.json({
          pipeline: "reasoning",
          operatorId,
          situationId,
          investigationDepth: "standard",
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

        // Look up from KnowledgePage
        const policySitPages = await prisma.$queryRawUnsafe<Array<{
          properties: Record<string, unknown> | null;
        }>>(
          `SELECT properties FROM "KnowledgePage"
           WHERE "operatorId" = $1
             AND "pageType" = 'situation_instance'
             AND properties->>'situation_id' = $2
           LIMIT 1`,
          operatorId, situationId,
        );
        if (policySitPages.length === 0) {
          return NextResponse.json({ error: `Situation ${situationId} not found` }, { status: 404 });
        }

        const sitProps = policySitPages[0].properties ?? {};
        const sitTypeSlug = (sitProps.situation_type as string) ?? "";

        // Resolve situation type name
        const sitType = sitTypeSlug
          ? await prisma.situationType.findFirst({
              where: { operatorId, slug: sitTypeSlug },
              select: { name: true },
            })
          : null;

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
          "unknown",
          "",
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
          situationType: sitType?.name ?? sitTypeSlug,
          triggerEntityTypeSlug: "unknown",
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
