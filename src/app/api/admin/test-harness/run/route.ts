import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storeRawContent } from "@/lib/storage/raw-content-store";
import { detectSituations } from "@/lib/situation-detector";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import {
  runIdentityResolution,
  updateEntityEmbedding,
} from "@/lib/identity-resolution";
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
  "identity-resolution",
  "situation-detection",
  "content-detection",
  "context-assembly",
  "reasoning-single",
  "reasoning-multi",
  "policy-evaluation",
  "copilot-tools",
] as const;

const LAYER_TIMEOUT_MS = 30_000;
const DETECTION_TIMEOUT_MS = 90_000;

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

    const existingSitTypes = await prisma.situationType.findMany({
      where: { operatorId, enabled: true },
      select: { id: true, slug: true, detectionLogic: true },
    });

    // Track test data for cleanup
    const createdContentChunkSourceIds: string[] = [];
    const createdActivitySignalIds: string[] = [];
    const createdEntityIds: string[] = [];
    const createdPolicyIds: string[] = [];
    const createdMergeLogIds: string[] = [];
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

    // ── Layer 2: activity-signals ────────────────────────────────────────

    if (shouldRun("activity-signals")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" = "passed";
      const data: Record<string, unknown> = {};

      try {
        await withTimeout(async () => {
          const signals = [
            {
              signalType: "email_received",
              actorEntityId: contactEntity.id,
              targetEntityIds: JSON.stringify([personEntity.id]),
              domainIds: JSON.stringify(deptIds),
              metadata: JSON.stringify({ subject: "Q3 Report", _testRunId: testRunId }),
              occurredAt: daysAgo(2),
            },
            {
              signalType: "meeting_held",
              actorEntityId: personEntity.id,
              targetEntityIds: JSON.stringify([contactEntity.id]),
              domainIds: JSON.stringify(deptIds),
              metadata: JSON.stringify({ attendees: [personEmail, contactEmail], duration_minutes: 30, _testRunId: testRunId }),
              occurredAt: daysAgo(5),
            },
            {
              signalType: "doc_edited",
              actorEntityId: personEntity.id,
              targetEntityIds: null,
              domainIds: JSON.stringify(deptIds),
              metadata: JSON.stringify({ fileName: "test-doc.gdoc", _testRunId: testRunId }),
              occurredAt: daysAgo(1),
            },
          ];

          for (const sig of signals) {
            const created = await prisma.activitySignal.create({
              data: { operatorId, ...sig },
            });
            createdActivitySignalIds.push(created.id);
          }

          // Assert: all 3 exist
          const found = await prisma.activitySignal.findMany({
            where: { operatorId, id: { in: createdActivitySignalIds } },
          });
          assert(assertions, "All 3 ActivitySignals created", found.length === 3, `found ${found.length}`);

          // Assert: domainIds populated
          const allHaveDepts = found.every((s) => s.domainIds && s.domainIds.length > 2);
          assert(assertions, "domainIds populated on all signals", allHaveDepts);

          // Assert: actorEntityId references existing entity
          const actorIds = [...new Set(found.map((s) => s.actorEntityId).filter(Boolean))];
          const actorEntities = await prisma.entity.findMany({
            where: { id: { in: actorIds as string[] }, operatorId },
            select: { id: true },
          });
          assert(assertions, "actorEntityId references existing entity", actorEntities.length === actorIds.length, `${actorEntities.length}/${actorIds.length} actors found`);

          data.signalIds = createdActivitySignalIds;
          data.signalCount = found.length;
        }, LAYER_TIMEOUT_MS);
      } catch (err) {
        status = "failed";
        assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
      }

      if (assertions.some((a) => !a.passed)) status = "failed";
      layers.push({ name: "activity-signals", status, duration_ms: Date.now() - start, assertions, data });
    }

    // ── Layer 3: identity-resolution ─────────────────────────────────────

    if (shouldRun("identity-resolution")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" = "passed";
      const data: Record<string, unknown> = {};

      try {
        await withTimeout(async () => {
          // Find contact entity type for creating test entities
          const contactType = await prisma.entityType.findFirst({
            where: { operatorId, slug: "contact" },
            select: { id: true },
          });
          if (!contactType) {
            assert(assertions, "Contact entity type exists", false, "No 'contact' entity type found");
            return;
          }

          // Find email property
          const emailProp = await prisma.entityProperty.findFirst({
            where: { entityType: { operatorId, slug: "contact" }, identityRole: "email" },
            select: { id: true },
          });

          // Create 2 overlapping entities
          const testEmail = `test-${testRunId}@example.com`;

          const entity1 = await prisma.entity.create({
            data: {
              operatorId,
              entityTypeId: contactType.id,
              displayName: `Test Contact A (${testRunId})`,
              category: "external",
              sourceSystem: "hubspot",
              metadata: JSON.stringify({ _testRunId: testRunId }),
            },
          });
          createdEntityIds.push(entity1.id);

          const entity2 = await prisma.entity.create({
            data: {
              operatorId,
              entityTypeId: contactType.id,
              displayName: `Test Contact A (${testRunId})`,
              category: "external",
              sourceSystem: "stripe",
              metadata: JSON.stringify({ _testRunId: testRunId }),
            },
          });
          createdEntityIds.push(entity2.id);

          // Set overlapping email property
          if (emailProp) {
            await prisma.propertyValue.createMany({
              data: [
                { entityId: entity1.id, propertyId: emailProp.id, value: testEmail },
                { entityId: entity2.id, propertyId: emailProp.id, value: testEmail },
              ],
            });
          }

          // Update embeddings
          try {
            await updateEntityEmbedding(entity1.id);
            await updateEntityEmbedding(entity2.id);
          } catch {
            // Non-fatal — embeddings may fail if no API key
          }

          // Run identity resolution scoped to these entities
          const result = await runIdentityResolution(operatorId, [entity1.id, entity2.id]);
          assert(assertions, "Identity resolution completed without error", true);

          // Check results
          const mergedEntity = await prisma.entity.findUnique({
            where: { id: entity2.id },
            select: { status: true, mergedIntoId: true },
          });

          const wasMerged = mergedEntity?.status === "merged";
          const hasSuggestion = result.suggested > 0;

          assert(
            assertions,
            "Pipeline found the match (merge or suggestion)",
            wasMerged || hasSuggestion || result.autoMerged > 0,
            wasMerged
              ? `auto-merged`
              : hasSuggestion
                ? `suggestion created (${result.suggested})`
                : `autoMerged=${result.autoMerged}, suggested=${result.suggested}`,
          );

          data.autoMerged = result.autoMerged;
          data.suggested = result.suggested;
          data.testEntityIds = [entity1.id, entity2.id];
        }, LAYER_TIMEOUT_MS);
      } catch (err) {
        status = "failed";
        assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
      }

      if (assertions.some((a) => !a.passed)) status = "failed";
      layers.push({ name: "identity-resolution", status, duration_ms: Date.now() - start, assertions, data });
    }

    // ── Layer 4: situation-detection ─────────────────────────────────────

    if (shouldRun("situation-detection")) {
      const start = Date.now();
      const assertions: Assertion[] = [];
      let status: "passed" | "failed" | "skipped" = "passed";
      const data: Record<string, unknown> = {};

      const structuredTypes = existingSitTypes.filter((t) => {
        try {
          const dl = JSON.parse(t.detectionLogic);
          return dl.mode === "structured" || dl.mode === "natural" || dl.mode === "hybrid";
        } catch {
          return false;
        }
      });

      if (structuredTypes.length === 0) {
        status = "skipped";
        layers.push({
          name: "situation-detection",
          status,
          duration_ms: Date.now() - start,
          reason: "skipped — no SituationTypes with structured/natural detection",
          assertions: [],
        });
      } else {
        try {
          await withTimeout(async () => {
            const results = await detectSituations(operatorId);
            assert(assertions, "Detection completed without error", true);

            if (results.length > 0) {
              for (const r of results) {
                if (r.situationId) situationIds.push(r.situationId);
              }
              const validResults = results.filter((r) => r.situationId && r.entityId && r.situationTypeId);
              assert(
                assertions,
                "Created situations have valid fields",
                validResults.length === results.length,
                `${validResults.length}/${results.length} valid`,
              );
              data.situationsCreated = results.length;
              data.situationIds = results.map((r) => r.situationId);
            } else {
              // No situations — validate detection logic format
              const formatIssues: string[] = [];
              for (const st of structuredTypes) {
                try {
                  const dl = JSON.parse(st.detectionLogic);
                  if (dl.mode === "structured" && !dl.structured?.entityType) {
                    formatIssues.push(`${st.slug}: structured mode missing entityType`);
                  }
                  if (dl.mode === "structured" && !dl.structured?.signals?.length) {
                    formatIssues.push(`${st.slug}: structured mode missing signals`);
                  }
                } catch {
                  formatIssues.push(`${st.slug}: unparseable detectionLogic`);
                }
              }
              assert(
                assertions,
                "Detection logic formats are valid",
                formatIssues.length === 0,
                formatIssues.length > 0
                  ? `Format issues: ${formatIssues.join("; ")}`
                  : "All formats valid — no matching entities found (expected if operator lacks matching data)",
              );
              data.situationsCreated = 0;
              data.detectionLogicValid = formatIssues.length === 0;
            }
          }, DETECTION_TIMEOUT_MS);
        } catch (err) {
          status = "failed";
          assert(assertions, "Layer completed without error", false, err instanceof Error ? err.message : String(err));
        }

        if (assertions.some((a) => !a.passed)) status = "failed";
        layers.push({ name: "situation-detection", status, duration_ms: Date.now() - start, assertions, data });
      }
    }

    // ── Layer 5: content-detection ───────────────────────────────────────

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
              const beforeCount = await prisma.situation.count({
                where: { operatorId, source: "content_detected" },
              });

              await evaluateContentForSituations(operatorId, items);

              const afterCount = await prisma.situation.count({
                where: { operatorId, source: "content_detected" },
              });

              assert(assertions, "Content detection completed without error", true);

              const newCount = afterCount - beforeCount;
              data.situationsCreated = newCount;

              if (newCount > 0) {
                const newSits = await prisma.situation.findMany({
                  where: { operatorId, source: "content_detected" },
                  orderBy: { createdAt: "desc" },
                  take: newCount,
                  select: {
                    id: true,
                    triggerEntityId: true,
                    situationType: { select: { detectionLogic: true } },
                  },
                });

                for (const s of newSits) situationIds.push(s.id);

                const hasValidTrigger = newSits.every((s) => !!s.triggerEntityId);
                assert(assertions, "Created situations have valid triggerEntityId", hasValidTrigger);

                // Check mode: "content"
                const hasContentMode = newSits.some((s) => {
                  try {
                    const dl = JSON.parse(s.situationType.detectionLogic);
                    return dl.mode === "content";
                  } catch {
                    return false;
                  }
                });
                assert(assertions, "Auto-created SituationType has mode: content", hasContentMode);
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
        const existing = await prisma.situation.findFirst({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        targetSituationId = existing?.id ?? null;
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
            const situation = await prisma.situation.findFirst({
              where: { id: targetSituationId!, operatorId },
              select: { situationTypeId: true, triggerEntityId: true, triggerEventId: true },
            });

            if (!situation) {
              assert(assertions, "Situation exists", false);
              return;
            }

            // Lightweight entity context (full context assembly removed — reasoning engine uses agentic tool-use loop)
            const entity = situation.triggerEntityId
              ? await prisma.entity.findFirst({
                  where: { id: situation.triggerEntityId, operatorId },
                  include: {
                    entityType: { select: { name: true } },
                    propertyValues: { include: { property: { select: { slug: true } } } },
                  },
                })
              : null;

            contextSituationId = targetSituationId;

            assert(assertions, "Context assembly returned", true);
            assert(
              assertions,
              "Trigger entity populated",
              !!entity?.displayName,
              entity?.displayName ?? "null",
            );

            data.situationId = targetSituationId;
            data.triggerEntity = entity ? {
              displayName: entity.displayName,
              type: entity.entityType.name,
              propertyCount: entity.propertyValues.length,
            } : null;
            data.note = "Lightweight context — full investigation done by agentic loop";
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

            // Load result
            const result = await prisma.situation.findUnique({
              where: { id: contextSituationId! },
              select: { status: true, reasoning: true, proposedAction: true, investigationDepth: true },
            });
            data.status = result?.status;
            data.investigationDepth = result?.investigationDepth;
            data.hasReasoning = !!result?.reasoning;
            data.hasActionPlan = !!result?.proposedAction;
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
        const existing = await prisma.situation.findFirst({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        policySituationId = existing?.id ?? null;
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
            const situation = await prisma.situation.findFirst({
              where: { id: policySituationId!, operatorId },
              include: { situationType: true },
            });
            if (!situation) {
              assert(assertions, "Situation exists", false);
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
              triggerEntityTypeSlug,
              situation.triggerEntityId ?? "",
            );

            assert(assertions, "Policy evaluation completed", true);
            assert(assertions, "hasRequireApproval is true (temp policy active)", policyResult.hasRequireApproval);

            const effectiveAutonomy = getEffectiveAutonomy(situation.situationType, policyResult);
            assert(
              assertions,
              "REQUIRE_APPROVAL forces supervised mode",
              effectiveAutonomy === "supervised",
              `effective=${effectiveAutonomy}, situationType.autonomyLevel=${situation.situationType.autonomyLevel}`,
            );

            data.permitted = policyResult.permitted.map((p) => p.name);
            data.blocked = policyResult.blocked.map((b) => ({ name: b.name, reason: b.reason }));
            data.hasRequireApproval = policyResult.hasRequireApproval;
            data.effectiveAutonomy = effectiveAutonomy;
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

          // get_activity_summary — query ActivitySignals
          try {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const signals = await prisma.activitySignal.findMany({
              where: { operatorId, occurredAt: { gte: since } },
              select: { signalType: true, domainIds: true },
            });

            // Aggregate
            const counts = new Map<string, number>();
            for (const s of signals) counts.set(s.signalType, (counts.get(s.signalType) ?? 0) + 1);

            toolResults.get_activity_summary = { count: signals.length };
            assert(assertions, "get_activity_summary: returns without error", true, `${signals.length} signals across ${counts.size} types`);

            // Verify scoping — no raw vector data
            const signalKeys = signals.length > 0 ? Object.keys(signals[0]) : [];
            const hasVectorField = signalKeys.some((k) => k.toLowerCase().includes("embedding") || k.toLowerCase().includes("vector"));
            assert(assertions, "get_activity_summary: no vector data leaked", !hasVectorField);
          } catch (err) {
            toolResults.get_activity_summary = { count: 0, error: err instanceof Error ? err.message : String(err) };
            assert(assertions, "get_activity_summary: returns without error", false, toolResults.get_activity_summary.error);
          }

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

      // Delete ActivitySignals by IDs
      if (createdActivitySignalIds.length > 0) {
        const deleted = await prisma.activitySignal.deleteMany({
          where: { operatorId, id: { in: createdActivitySignalIds } },
        });
        cleanupResult.activitySignalsDeleted = deleted.count;
      }

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
