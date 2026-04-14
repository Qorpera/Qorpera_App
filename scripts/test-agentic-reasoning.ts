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
 * 2. Creates a test wiki page (KnowledgePage) with situation_instance data
 * 3. Reports the created page
 *
 * Options:
 *   --cleanup   Delete the test page after reporting
 */

import { prisma } from "@/lib/db";

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

  // ── Step 2: Create test wiki page (situation_instance) ─────────────────

  const triggerEvidence = JSON.stringify({
    type: "email",
    content: `Subject: Urgent — delivery delay on PO-2026-042\n\nHej,\n\nWe are experiencing a significant delay on the order referenced above. The shipment was expected last week but our warehouse has not received it. This is affecting our production schedule.\n\nCan you please look into this and provide an updated delivery estimate?\n\nMed venlig hilsen,\n${triggerEntity.displayName}`,
    sender: "supplier@example.dk",
    recipient: "operations@company.dk",
    timestamp: new Date().toISOString(),
  });

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      subjectEntityId: triggerEntity.id,
      title: `Delivery delay reported by ${triggerEntity.displayName} on PO-2026-042`,
      slug: `test-situation-${Date.now()}`,
      content: triggerEvidence,
      contentTokens: Math.ceil(triggerEvidence.length / 4),
      properties: {
        situation_id: `test-${Date.now()}`,
        status: "detected",
        severity: 0.7,
        confidence: 0.85,
        situation_type: situationType.slug,
        detected_at: new Date().toISOString(),
        source: "test",
      },
      confidence: 0.85,
      status: "draft",
      sourceCount: 1,
      synthesisPath: "test",
      synthesizedByModel: "test",
      lastSynthesizedAt: new Date(),
    },
  });

  console.log(`\n✓ Created test wiki page: ${page.id}`);
  console.log(`  Type: situation_instance`);
  console.log(`  Situation type: ${situationType.name}`);
  console.log(`  Entity: ${triggerEntity.displayName} [${triggerEntity.entityType.name}]`);

  // ── Step 3: Governance check ────────────────────────────────────────────

  console.log(`\n── Governance Compliance ──`);
  const blockedActions = await prisma.policyRule.findMany({
    where: { operatorId, enabled: true, effect: "DENY" },
    select: { name: true, actionType: true },
  });
  console.log(`  Active DENY rules: ${blockedActions.length}`);

  // Summary
  console.log(`\n══ SUMMARY ══`);
  const checks = [
    { name: "Wiki page created", pass: !!page.id },
    { name: "Situation type exists", pass: !!situationType },
    { name: "Trigger entity found", pass: !!triggerEntity },
  ];

  for (const check of checks) {
    console.log(`  ${check.pass ? "✓" : "✗"} ${check.name}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "✅ All checks passed!" : "❌ Some checks failed — review above."}`);

  // Cleanup
  if (cleanup) {
    console.log(`\n🧹 Cleaning up test page...`);
    await prisma.knowledgePage.delete({ where: { id: page.id } });
    console.log(`  ✓ Deleted page ${page.id}`);
  } else {
    console.log(`\nTest page ID: ${page.id}`);
    console.log(`To clean up: npx tsx scripts/test-agentic-reasoning.ts ${operatorId} --cleanup`);
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
