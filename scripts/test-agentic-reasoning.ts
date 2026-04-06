/**
 * Integration test for the agentic reasoning engine.
 *
 * Run with: npx tsx scripts/test-agentic-reasoning.ts <operatorId>
 *
 * Prerequisites:
 * - A seeded synthetic company (run synthetic seed first)
 * - ANTHROPIC_API_KEY set in environment
 * - Database accessible
 *
 * What it does:
 * 1. Finds a suitable situation type + trigger entity for the operator
 * 2. Creates a test situation with realistic trigger evidence
 * 3. Calls reasonAboutSituation()
 * 4. Waits for completion
 * 5. Queries and reports:
 *    - Situation status progression
 *    - ToolCallTrace records (count, tools used, total duration)
 *    - Reasoning output (parsed JSON)
 *    - Execution plan (if created)
 *    - Governance compliance (no blocked actions in plan)
 *
 * Options:
 *   --cleanup   Delete the test situation and its traces after reporting
 */

import { prisma } from "@/lib/db";
import { reasonAboutSituation } from "@/lib/reasoning-engine";

async function main() {
  const args = process.argv.slice(2);
  const cleanup = args.includes("--cleanup");
  const operatorId = args.find((a) => !a.startsWith("--"));

  if (!operatorId) {
    console.error("Usage: npx tsx scripts/test-agentic-reasoning.ts <operatorId> [--cleanup]");
    process.exit(1);
  }

  // ── Step 1: Find test data ──────────────────────────────────────────────

  const situationType = await prisma.situationType.findFirst({
    where: { operatorId, enabled: true },
    orderBy: { createdAt: "desc" },
  });
  if (!situationType) {
    console.error("No situation types found for operator", operatorId);
    process.exit(1);
  }

  let triggerEntity = await prisma.entity.findFirst({
    where: { operatorId, category: "external", status: "active" },
    include: { entityType: { select: { name: true, slug: true } } },
  });
  if (!triggerEntity) {
    triggerEntity = await prisma.entity.findFirst({
      where: { operatorId, category: "base", status: "active" },
      include: { entityType: { select: { name: true, slug: true } } },
    });
  }
  if (!triggerEntity) {
    console.error("No entities found for operator", operatorId);
    process.exit(1);
  }

  // ── Step 2: Create test situation ───────────────────────────────────────

  const triggerEvidence = JSON.stringify({
    type: "email",
    content: `Subject: Urgent — delivery delay on PO-2026-042\n\nHej,\n\nWe are experiencing a significant delay on the order referenced above. The shipment was expected last week but our warehouse has not received it. This is affecting our production schedule.\n\nCan you please look into this and provide an updated delivery estimate?\n\nMed venlig hilsen,\n${triggerEntity.displayName}`,
    sender: "supplier@example.dk",
    recipient: "operations@company.dk",
    timestamp: new Date().toISOString(),
  });

  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId: situationType.id,
      severity: 0.7,
      confidence: 0.85,
      status: "detected",
      source: "manual_test",
      triggerEvidence,
      triggerSummary: `Delivery delay reported by ${triggerEntity.displayName} on PO-2026-042`,
      triggerEntityId: triggerEntity.id,
    },
  });

  console.log(`\n✓ Created test situation: ${situation.id}`);
  console.log(`  Type: ${situationType.name}`);
  console.log(`  Entity: ${triggerEntity.displayName} [${triggerEntity.entityType.name}]`);
  console.log(`  Status: ${situation.status}`);

  // ── Step 3: Run reasoning ───────────────────────────────────────────────

  console.log(`\n⏳ Starting agentic reasoning...`);
  const startTime = Date.now();

  try {
    await reasonAboutSituation(situation.id);
  } catch (err) {
    console.error(`\n✗ Reasoning failed:`, err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✓ Reasoning completed in ${elapsed}s`);

  // ── Step 4: Query and report results ────────────────────────────────────

  const result = await prisma.situation.findUnique({
    where: { id: situation.id },
    include: {
      executionPlan: {
        include: { steps: { orderBy: { sequenceOrder: "asc" } } },
      },
      toolCallTraces: {
        orderBy: [{ cycleNumber: "asc" }, { callIndex: "asc" }],
      },
      cycles: true,
    },
  });

  if (!result) {
    console.error("Situation disappeared!");
    process.exit(1);
  }

  // Status
  console.log(`\n── Status ──`);
  console.log(`  Final status: ${result.status}`);
  console.log(`  Model: ${result.modelId}`);
  console.log(`  Duration: ${result.reasoningDurationMs}ms`);
  console.log(`  API cost: $${((result.apiCostCents ?? 0) / 100).toFixed(2)}`);

  // Tool call traces
  console.log(`\n── Tool Call Traces ──`);
  console.log(`  Total calls: ${result.toolCallTraces.length}`);
  const toolCounts: Record<string, number> = {};
  let totalToolMs = 0;
  let totalToolTokens = 0;
  for (const t of result.toolCallTraces) {
    toolCounts[t.toolName] = (toolCounts[t.toolName] || 0) + 1;
    totalToolMs += t.durationMs;
    totalToolTokens += t.resultTokens;
  }
  console.log(`  Total tool duration: ${totalToolMs}ms`);
  console.log(`  Total result tokens: ${totalToolTokens}`);
  console.log(`  Tools used:`);
  for (const [name, count] of Object.entries(toolCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name}: ${count}x`);
  }

  // Print each tool call in order
  console.log(`\n── Investigation Trace ──`);
  for (const t of result.toolCallTraces) {
    const traceArgs = JSON.stringify(t.arguments).slice(0, 100);
    const summary = (t.resultSummary || "").slice(0, 80);
    console.log(`  [${t.callIndex}] ${t.toolName}(${traceArgs}) → ${t.durationMs}ms — "${summary}..."`);
  }

  // Reasoning output
  console.log(`\n── Reasoning Output ──`);
  if (result.reasoning) {
    try {
      const reasoning = JSON.parse(result.reasoning);
      console.log(`  Title: ${reasoning.situationTitle}`);
      console.log(`  Confidence: ${reasoning.confidence}`);
      console.log(`  Resolution type: ${reasoning.resolutionType}`);
      console.log(`  Analysis: ${(reasoning.analysis || "").slice(0, 200)}...`);
      console.log(`  Evidence summary: ${(reasoning.evidenceSummary || "").slice(0, 200)}...`);
      if (reasoning.actionBatch) {
        console.log(`  Action batch: ${reasoning.actionBatch.length} steps`);
        for (const step of reasoning.actionBatch) {
          console.log(`    - [${step.executionMode}] ${step.title}${step.actionCapabilityName ? ` → ${step.actionCapabilityName}` : ""}`);
        }
      } else {
        console.log(`  Action batch: null (no action recommended)`);
      }
      if (reasoning.missingContext) {
        console.log(`  Missing context: ${JSON.stringify(reasoning.missingContext)}`);
      }
      if (reasoning.situationOwner) {
        console.log(`  Owner: ${reasoning.situationOwner.entityName} (${reasoning.situationOwner.entityRole})`);
      }
    } catch {
      console.log(`  (could not parse reasoning JSON)`);
      console.log(`  Raw: ${(result.reasoning || "").slice(0, 300)}`);
    }
  } else {
    console.log(`  (no reasoning output — check for errors)`);
  }

  // Execution plan
  console.log(`\n── Execution Plan ──`);
  if (result.executionPlan) {
    console.log(`  Plan ID: ${result.executionPlan.id}`);
    console.log(`  Steps: ${result.executionPlan.steps.length}`);
    for (const step of result.executionPlan.steps) {
      console.log(`    ${step.sequenceOrder}. [${step.status}] ${step.title} (${step.executionMode})`);
    }
  } else {
    console.log(`  No execution plan created${result.status === "proposed" ? " (null plan — review-only)" : ""}`);
  }

  // Governance check
  console.log(`\n── Governance Compliance ──`);
  const blockedActions = await prisma.policyRule.findMany({
    where: { operatorId, enabled: true, effect: "DENY" },
    select: { name: true, actionType: true },
  });
  const blockedNames = new Set(blockedActions.map((b) => b.name).filter(Boolean));
  if (result.reasoning) {
    try {
      const reasoning = JSON.parse(result.reasoning);
      if (reasoning.actionBatch) {
        const violations = reasoning.actionBatch.filter(
          (s: { actionCapabilityName?: string }) => s.actionCapabilityName && blockedNames.has(s.actionCapabilityName),
        );
        if (violations.length > 0) {
          console.log(`  ✗ VIOLATION: ${violations.length} blocked actions in plan!`);
          for (const v of violations) console.log(`    - ${v.actionCapabilityName}`);
        } else {
          console.log(`  ✓ No blocked actions in plan`);
        }
      } else {
        console.log(`  ✓ No plan — governance check N/A`);
      }
    } catch {
      console.log(`  Could not verify (parse error)`);
    }
  }

  // Cycle record
  console.log(`\n── Situation Cycle ──`);
  if (result.cycles.length > 0) {
    const cycle = result.cycles[0];
    console.log(`  ✓ Cycle record created: #${cycle.cycleNumber} (${cycle.triggerType})`);
  } else {
    console.log(`  ✗ No cycle record created`);
  }

  // Summary
  console.log(`\n══ SUMMARY ══`);
  const checks = [
    { name: "Status advanced from detected", pass: result.status !== "detected" },
    { name: "Tool calls executed", pass: result.toolCallTraces.length > 0 },
    { name: "ToolCallTrace records created", pass: result.toolCallTraces.length > 0 },
    { name: "Reasoning output present", pass: !!result.reasoning },
    { name: "Model is claude-opus-4-6", pass: result.modelId === "claude-opus-4-6" },
    { name: "Cycle record created", pass: result.cycles.length > 0 },
    {
      name: "No governance violations",
      pass: (() => {
        try {
          const r = JSON.parse(result.reasoning || "{}");
          return !r.actionBatch || r.actionBatch.every(
            (s: { actionCapabilityName?: string }) => !s.actionCapabilityName || !blockedNames.has(s.actionCapabilityName),
          );
        } catch {
          return true;
        }
      })(),
    },
  ];

  for (const check of checks) {
    console.log(`  ${check.pass ? "✓" : "✗"} ${check.name}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "✅ All checks passed!" : "❌ Some checks failed — review above."}`);

  // Cleanup
  if (cleanup) {
    console.log(`\n🧹 Cleaning up test situation...`);
    await prisma.toolCallTrace.deleteMany({ where: { situationId: situation.id } });
    await prisma.situationCycle.deleteMany({ where: { situationId: situation.id } });
    if (result.executionPlan) {
      await prisma.executionStep.deleteMany({ where: { planId: result.executionPlan.id } });
      await prisma.executionPlan.delete({ where: { id: result.executionPlan.id } });
    }
    await prisma.situation.delete({ where: { id: situation.id } });
    console.log(`  ✓ Deleted situation ${situation.id} and related records`);
  } else {
    console.log(`\nTest situation ID: ${situation.id}`);
    console.log(`To clean up: npx tsx scripts/test-agentic-reasoning.ts ${operatorId} --cleanup`);
    console.log(`  Or: DELETE FROM "Situation" WHERE id = '${situation.id}';`);
  }

  return allPass;
}

main()
  .then(async (pass) => {
    await prisma.$disconnect();
    process.exit(pass ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("\n✗ Unhandled error:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
