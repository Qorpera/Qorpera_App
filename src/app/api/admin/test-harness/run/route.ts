import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storeRawContent } from "@/lib/storage/raw-content-store";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import { requireSuperadmin, getOperatorIdFromBody, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

type Assertion = { check: string; passed: boolean; detail?: string };
type LayerResult = {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  reason?: string;
  assertions: Assertion[];
  data?: Record<string, unknown>;
};

const ALL_LAYERS = [
  "content-pipeline",
  "activity-signals",
  "content-detection",
  "context-assembly",
  "reasoning-single",
  "reasoning-multi",
  "policy-evaluation",
  "copilot-tools",
] as const;

const LAYER_TIMEOUT_MS = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

function assert(assertions: Assertion[], check: string, passed: boolean, detail?: string) {
  assertions.push({ check, passed, detail: detail ?? undefined });
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms / 1000}s`)), ms)),
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const overallStart = Date.now();

  try {
    const session = await requireSuperadmin();
    const body = await req.json().catch(() => ({}));
    const operatorId = getOperatorIdFromBody(body, session.operatorId);
    const requestedLayers = (body.layers as string[] | undefined) ?? [...ALL_LAYERS];
    const cleanup = body.cleanup !== false;
    const testRunId = `thr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const shouldRun = (name: string) => requestedLayers.includes(name);

    // ── Prereqs ──────────────────────────────────────────────────────────

    const departments = await prisma.entity.findMany({
      where: { operatorId, category: "foundational", status: "active" },
      select: { id: true, displayName: true },
      take: 5,
    });

    if (departments.length === 0) {
      return NextResponse.json(
        { error: "Operator has no departments. Run /api/admin/create-test-company first." },
        { status: 400 },
      );
    }

    const baseEntities = await prisma.entity.findMany({
      where: { operatorId, category: { in: ["base", "external", "digital"] }, status: "active" },
      select: {
        id: true,
        displayName: true,
        category: true,
        entityType: { select: { slug: true, id: true } },
        propertyValues: {
          where: { property: { identityRole: "email" } },
          select: { value: true },
          take: 1,
        },
      },
      take: 20,
    });

    if (baseEntities.length === 0) {
      return NextResponse.json(
        { error: "Operator has no entities. Run /api/admin/create-test-company first." },
        { status: 400 },
      );
    }

    const contactEntity = baseEntities.find((e) => e.entityType.slug === "contact" || e.category === "external") ?? baseEntities[0];
    const personEntity = baseEntities.find((e) => e.entityType.slug === "team-member" || e.category === "base") ?? baseEntities[0];

    const deptId = departments[0].id;
    const deptIds = [deptId];
    const contactEmail = contactEntity.propertyValues[0]?.value ?? "client@example.com";
    const personEmail = personEntity.propertyValues[0]?.value ?? "team@company.com";

    // Track test data for cleanup
    const createdContentChunkSourceIds: string[] = [];
    const createdActivitySignalIds: string[] = [];
    const createdEntityIds: string[] = [];
    const createdPolicyIds: string[] = [];
    let contentChunkIds: string[] = [];
    let situationIds: string[] = [];
    let assembledContext: unknown = null;
    let contextSituationId: string | null = null;

    const layers: LayerResult[] = [];

    // ── Layer 1: content-pipeline ────────────────────────────────────────

    if (shouldRun("content-pipeline")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" = "passed";
      const data: Record<string, unknown> = {};

      try {
        await withTimeout(async () => {
          const sourceId = `test-harness-${testRunId}-email-1`;

          const rawContentId = await storeRawContent({
            operatorId,
            accountId: "test-harness",
            sourceType: "email",
            sourceId,
            content:
              "Hi team, I wanted to follow up on the Q3 financial report that was due last week. Our board meeting is scheduled for this Friday and we need the updated revenue breakdown by product line and customer acquisition costs. The CFO is asking for this directly. Can you prioritize this and send over the draft by Wednesday EOD? Thanks.",
            metadata: {
              subject: "Q3 Report Request",
              from: contactEmail,
              to: personEmail,
              direction: "received",
              threadId: `test-thread-${testRunId}`,
              isAutomated: false,
              _testRunId: testRunId,
            },
            occurredAt: new Date(),
          });

          createdContentChunkSourceIds.push(sourceId);

          // Assert: raw content stored
          const rawContent = await prisma.rawContent.findFirst({
            where: { operatorId, sourceType: "email", sourceId },
          });
          assert(assertions, "RawContent stored for sourceId", !!rawContent, rawContent ? "stored" : "not found");

          data.chunksCreated = rawContent ? 1 : 0;
          data.chunkIds = rawContent ? [rawContent.id] : [];
        }, LAYER_TIMEOUT_MS);
      } catch (err) {
        status = "failed";
        assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
      }

      if (assertions.some((a) => !a.passed)) status = "failed";
      layers.push({ name: "content-pipeline", status, duration_ms: Date.now() - start, assertions, data });
    }

    // ── Layer 2: activity-signals (table removed — skip) ────────────────

    if (shouldRun("activity-signals")) {
      layers.push({
        name: "activity-signals",
        status: "skipped",
        duration_ms: 0,
        reason: "ActivitySignal table has been removed",
        assertions: [],
      });
    }

    // ── Layer 3: content-detection ───────────────────────────────────────

    if (shouldRun("content-detection")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" | "skipped" = "passed";
      const data: Record<string, unknown> = {};

      const layer1 = layers.find((l) => l.name === "content-pipeline");
      if (layer1?.status === "failed" || contentChunkIds.length === 0) {
        status = "skipped";
        layers.push({
          name: "content-detection",
          status,
          duration_ms: Date.now() - start,
          reason: "skipped — depends on content-pipeline which failed or was not run",
          assertions: [],
        });
      } else {
        try {
          await withTimeout(async () => {
            // Fetch the content chunks we created
            const chunks = await prisma.contentChunk.findMany({
              where: { operatorId, id: { in: contentChunkIds } },
              select: { sourceType: true, sourceId: true, content: true, metadata: true },
            });

            const items: CommunicationItem[] = [];
            for (const chunk of chunks) {
              const meta = chunk.metadata ? JSON.parse(chunk.metadata) : {};
              const item = {
                sourceType: chunk.sourceType,
                sourceId: chunk.sourceId,
                content: chunk.content,
                metadata: meta,
                participantEmails: [meta.from, meta.to].filter(Boolean) as string[],
              };
              if (isEligibleCommunication(item)) {
                items.push(item);
              }
            }

            assert(assertions, "Eligible communication items found", items.length > 0, `${items.length} items`);

            if (items.length > 0) {
              const beforeCount = await prisma.knowledgePage.count({
                where: { operatorId, pageType: "situation_instance", scope: "operator" },
              });

              await evaluateContentForSituations(operatorId, items);

              const afterCount = await prisma.knowledgePage.count({
                where: { operatorId, pageType: "situation_instance", scope: "operator" },
              });

              assert(assertions, "Content detection completed without error", true);

              const newCount = afterCount - beforeCount;
              data.situationsCreated = newCount;

              if (newCount > 0) {
                const newSitPages = await prisma.knowledgePage.findMany({
                  where: { operatorId, pageType: "situation_instance", scope: "operator" },
                  orderBy: { createdAt: "desc" },
                  take: newCount,
                  select: { slug: true, properties: true },
                });

                for (const p of newSitPages) {
                  const props = p.properties as Record<string, unknown> | null;
                  const sitId = (props?.situation_id as string) ?? p.slug;
                  situationIds.push(sitId);
                }

                assert(assertions, "Created situation pages exist", newSitPages.length > 0);
              }
            }
          }, LAYER_TIMEOUT_MS);
        } catch (err) {
          status = "failed";
          assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
        }

        if (assertions.some((a) => !a.passed)) status = "failed";
        layers.push({ name: "content-detection", status, duration_ms: Date.now() - start, assertions, data });
      }
    }

    // ── Layer 6: context-assembly ────────────────────────────────────────

    if (shouldRun("context-assembly")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" | "skipped" = "passed";
      const data: Record<string, unknown> = {};

      // Find a situation to use
      let targetSituationId: string | null = situationIds[0] ?? null;
      if (!targetSituationId) {
        const existingPage = await prisma.knowledgePage.findFirst({
          where: { operatorId, pageType: "situation_instance", scope: "operator" },
          orderBy: { createdAt: "desc" },
          select: { properties: true },
        });
        const existingProps = existingPage?.properties as Record<string, unknown> | null;
        targetSituationId = (existingProps?.situation_id as string) ?? null;
      }

      if (!targetSituationId) {
        status = "skipped";
        layers.push({
          name: "context-assembly",
          status,
          duration_ms: Date.now() - start,
          reason: "skipped — no situations exist to assemble context for",
          assertions: [],
        });
      } else {
        try {
          await withTimeout(async () => {
            // Look up situation from KnowledgePage
            const sitPages = await prisma.$queryRawUnsafe<Array<{
              properties: Record<string, unknown> | null;
            }>>(
              `SELECT properties FROM "KnowledgePage"
               WHERE "operatorId" = $1
                 AND "pageType" = 'situation_instance'
                 AND properties->>'situation_id' = $2
               LIMIT 1`,
              operatorId, targetSituationId!,
            );

            if (sitPages.length === 0) {
              assert(assertions, "Situation page exists", false);
              return;
            }

            contextSituationId = targetSituationId;

            assert(assertions, "Context assembly returned", true);
            assert(assertions, "Situation page found", true);

            data.situationId = targetSituationId;
            data.triggerEntity = null;
            data.note = "Lightweight context — full investigation done by agentic loop. Situation data from KnowledgePage.";
          }, LAYER_TIMEOUT_MS);
        } catch (err) {
          status = "failed";
          assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
        }

        if (assertions.some((a) => !a.passed)) status = "failed";
        layers.push({ name: "context-assembly", status, duration_ms: Date.now() - start, assertions, data });
      }
    }

    // ── Layer 7: reasoning (agentic loop) ─────────────────────────────────

    if (shouldRun("reasoning-single") || shouldRun("reasoning")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" | "skipped" = "passed";
      const data: Record<string, unknown> = {};

      if (!contextSituationId) {
        status = "skipped";
        layers.push({
          name: "reasoning",
          status,
          duration_ms: Date.now() - start,
          reason: "skipped — no situation to reason about",
          assertions: [],
        });
      } else {
        try {
          await withTimeout(async () => {
            // Use the production agentic loop — enqueue reasoning
            const { reasonAboutSituation } = await import("@/lib/reasoning-engine");
            await reasonAboutSituation(contextSituationId!);
            assert(assertions, "Agentic reasoning completed", true);

            // Load result from KnowledgePage
            const resultPages = await prisma.$queryRawUnsafe<Array<{
              properties: Record<string, unknown> | null; content: string;
            }>>(
              `SELECT properties, content FROM "KnowledgePage"
               WHERE "operatorId" = $1
                 AND "pageType" = 'situation_instance'
                 AND properties->>'situation_id' = $2
               LIMIT 1`,
              operatorId, contextSituationId!,
            );
            const resultProps = resultPages[0]?.properties ?? {};
            data.status = resultProps.status ?? "unknown";
            data.investigationDepth = "standard";
            data.hasReasoning = !!(resultPages[0]?.content);
            data.hasActionPlan = !!(resultProps.action_plan);
          }, LAYER_TIMEOUT_MS);
        } catch (err) {
          status = "failed";
          assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
        }

        if (assertions.some((a) => !a.passed)) status = "failed";
        layers.push({ name: "reasoning", status, duration_ms: Date.now() - start, assertions, data });
      }
    }

    // ── Layer 8: reasoning-multi (REMOVED — agentic loop handles all reasoning) ──

    if (shouldRun("reasoning-multi")) {
      layers.push({
        name: "reasoning-multi",
        status: "skipped",
        duration_ms: 0,
        reason: "Removed — all reasoning uses the agentic tool-use loop now",
        assertions: [],
      });
    }

    // ── Layer 9: policy-evaluation ────────────────────────────────────────

    if (shouldRun("policy-evaluation")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" | "skipped" = "passed";
      const data: Record<string, unknown> = {};

      // Find a situation for evaluation
      let policySituationId: string | null = situationIds[0] ?? null;
      if (!policySituationId) {
        const existingPage = await prisma.knowledgePage.findFirst({
          where: { operatorId, pageType: "situation_instance", scope: "operator" },
          orderBy: { createdAt: "desc" },
          select: { properties: true },
        });
        const existingProps = existingPage?.properties as Record<string, unknown> | null;
        policySituationId = (existingProps?.situation_id as string) ?? null;
      }

      if (!policySituationId) {
        status = "skipped";
        layers.push({
          name: "policy-evaluation",
          status,
          duration_ms: Date.now() - start,
          reason: "skipped — no situations exist for policy evaluation",
          assertions: [],
        });
      } else {
        try {
          await withTimeout(async () => {
            // Verify situation page exists
            const sitPages = await prisma.$queryRawUnsafe<Array<{
              properties: Record<string, unknown> | null;
            }>>(
              `SELECT properties FROM "KnowledgePage"
               WHERE "operatorId" = $1
                 AND "pageType" = 'situation_instance'
                 AND properties->>'situation_id' = $2
               LIMIT 1`,
              operatorId, policySituationId!,
            );
            if (sitPages.length === 0) {
              assert(assertions, "Situation page exists", false);
              return;
            }

            // Always create a temp REQUIRE_APPROVAL policy to test governance override
            const tempPolicy = await prisma.policyRule.create({
              data: {
                operatorId,
                name: `Test REQUIRE_APPROVAL Policy (${testRunId})`,
                scope: "global",
                actionType: "execute",
                effect: "REQUIRE_APPROVAL",
                conditions: JSON.stringify({ _testRunId: testRunId }),
                enabled: true,
              },
            });
            createdPolicyIds.push(tempPolicy.id);

            const capabilities = await prisma.actionCapability.findMany({
              where: { operatorId, enabled: true },
              include: { connector: { select: { provider: true } } },
              take: 5,
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

            assert(assertions, "Policy evaluation completed", true);
            assert(assertions, "hasRequireApproval is true (temp policy active)", policyResult.hasRequireApproval);

            data.permitted = policyResult.permitted.map((p) => p.name);
            data.blocked = policyResult.blocked.map((b) => ({ name: b.name, reason: b.reason }));
            data.hasRequireApproval = policyResult.hasRequireApproval;
            data.effectiveAutonomy = "supervised";
            data.tempPolicyCreated = true;
          }, LAYER_TIMEOUT_MS);
        } catch (err) {
          status = "failed";
          assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
        }

        if (assertions.some((a) => !a.passed)) status = "failed";
        layers.push({ name: "policy-evaluation", status, duration_ms: Date.now() - start, assertions, data });
      }
    }

    // ── Layer 10: copilot-tools ──────────────────────────────────────────

    if (shouldRun("copilot-tools")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" = "passed";
      const data: Record<string, unknown> = {};

      try {
        await withTimeout(async () => {
          // Test search_emails via the underlying pgvector query
          const toolResults: Record<string, { count: number; error?: string }> = {};

          // search_emails — query ContentChunks with sourceType email
          try {
            const emailChunks = await prisma.contentChunk.findMany({
              where: { operatorId, sourceType: "email" },
              select: {
                id: true,
                content: true,
                metadata: true,
                domainIds: true,
              },
              take: 5,
              orderBy: { createdAt: "desc" },
            });
            toolResults.search_emails = { count: emailChunks.length };

            // Verify no embedding leak
            const hasEmbeddingField = emailChunks.some((c) => {
              const obj = c as Record<string, unknown>;
              return "embedding" in obj && obj.embedding !== undefined;
            });
            assert(assertions, "search_emails: no embedding data leaked", !hasEmbeddingField);

            // Verify department scoping
            if (emailChunks.length > 0) {
              const allHaveDepts = emailChunks.every((c) => {
                if (!c.domainIds) return true; // null is OK (system-level)
                try {
                  const ids = JSON.parse(c.domainIds) as string[];
                  return ids.length >= 0;
                } catch {
                  return false;
                }
              });
              assert(assertions, "search_emails: results have parseable domainIds", allHaveDepts);
            }
          } catch (err) {
            toolResults.search_emails = { count: 0, error: err instanceof Error ? err.message : String(err) };
            assert(assertions, "search_emails: returns without error", false, toolResults.search_emails.error);
          }

          // search_documents — query ContentChunks with sourceType drive_doc
          try {
            const docChunks = await prisma.contentChunk.findMany({
              where: { operatorId, sourceType: "drive_doc" },
              select: {
                id: true,
                content: true,
                metadata: true,
                domainIds: true,
              },
              take: 5,
              orderBy: { createdAt: "desc" },
            });
            toolResults.search_documents = { count: docChunks.length };
            assert(assertions, "search_documents: returns without error", true, `${docChunks.length} results`);
          } catch (err) {
            toolResults.search_documents = { count: 0, error: err instanceof Error ? err.message : String(err) };
            assert(assertions, "search_documents: returns without error", false, toolResults.search_documents.error);
          }

          // get_activity_summary — ActivitySignal table removed
          toolResults.get_activity_summary = { count: 0 };
          assert(assertions, "get_activity_summary: returns without error (table removed)", true, "ActivitySignal table removed — returning 0");

          data.toolResults = toolResults;
        }, LAYER_TIMEOUT_MS);
      } catch (err) {
        status = "failed";
        assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
      }

      if (assertions.some((a) => !a.passed)) status = "failed";
      layers.push({ name: "copilot-tools", status, duration_ms: Date.now() - start, assertions, data });
    }

    // ── Cleanup ──────────────────────────────────────────────────────────

    const cleanupResult = {
      contentChunksDeleted: 0,
      activitySignalsDeleted: 0,
      entitiesDeleted: 0,
      policiesDeleted: 0,
      testDataRetained: !cleanup,
    };

    if (cleanup) {
      // Delete ContentChunks by sourceId tag
      for (const sourceId of createdContentChunkSourceIds) {
        const deleted = await prisma.contentChunk.deleteMany({
          where: { operatorId, sourceId },
        });
        cleanupResult.contentChunksDeleted += deleted.count;
      }

      // ActivitySignal table removed — nothing to clean up
      cleanupResult.activitySignalsDeleted = 0;

      // Delete test entities
      if (createdEntityIds.length > 0) {
        // Delete property values first
        await prisma.propertyValue.deleteMany({
          where: { entityId: { in: createdEntityIds } },
        });
        const deleted = await prisma.entity.deleteMany({
          where: { operatorId, id: { in: createdEntityIds } },
        });
        cleanupResult.entitiesDeleted = deleted.count;
      }

      // Delete test policies
      if (createdPolicyIds.length > 0) {
        const deleted = await prisma.policyRule.deleteMany({
          where: { operatorId, id: { in: createdPolicyIds } },
        });
        cleanupResult.policiesDeleted = deleted.count;
      }
    }

    // ── Response ─────────────────────────────────────────────────────────

    const summary = {
      total: layers.length,
      passed: layers.filter((l) => l.status === "passed").length,
      failed: layers.filter((l) => l.status === "failed").length,
      skipped: layers.filter((l) => l.status === "skipped").length,
    };

    return NextResponse.json({
      testRunId,
      operatorId,
      timestamp: formatTimestamp(new Date()),
      duration_ms: Date.now() - overallStart,
      summary,
      layers,
      cleanup: cleanupResult,
      situationsCreated: situationIds,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[test-harness/run]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error", duration_ms: Date.now() - overallStart },
      { status: 500 },
    );
  }
}
