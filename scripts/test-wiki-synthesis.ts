// scripts/test-wiki-synthesis.ts
//
// Validates the wiki background synthesis pipeline end-to-end.
// Run: npx tsx scripts/test-wiki-synthesis.ts
//
// Accepts --company "Name" to target a specific operator.
// Defaults to looking for Boltly, then falls back to any operator with data.

import { PrismaClient } from "@prisma/client";
import { runBackgroundSynthesis } from "../src/lib/wiki-background-synthesis";

const prisma = new PrismaClient();

async function main() {
  // Parse --company arg
  const companyArg = process.argv.find((_, i, a) => a[i - 1] === "--company");

  // Find the test operator
  let operator: { id: string; companyName: string | null } | null = null;

  if (companyArg) {
    operator = await prisma.operator.findFirst({
      where: { companyName: { contains: companyArg, mode: "insensitive" } },
      select: { id: true, companyName: true },
    });
  }

  if (!operator) {
    // Try Boltly first, then any operator with content data
    operator = await prisma.operator.findFirst({
      where: { companyName: { contains: "Boltly" } },
      select: { id: true, companyName: true },
    });
  }

  if (!operator) {
    // Fall back to any operator with ContentChunks
    const operatorWithData = await prisma.contentChunk.findFirst({
      select: { operatorId: true },
    });
    if (operatorWithData) {
      operator = await prisma.operator.findUnique({
        where: { id: operatorWithData.operatorId },
        select: { id: true, companyName: true },
      });
    }
  }

  if (!operator) {
    console.error(
      "No test operator found. Seed a synthetic company first (or use --company 'Name').",
    );
    process.exit(1);
  }

  console.log(
    `\n=== Wiki Synthesis Test: ${operator.companyName ?? operator.id} ===\n`,
  );

  // Check available data
  const [chunkCount, signalCount, entityCount] = await Promise.all([
    prisma.contentChunk.count({ where: { operatorId: operator.id } }),
    prisma.activitySignal.count({ where: { operatorId: operator.id } }),
    prisma.entity.count({
      where: { operatorId: operator.id, status: "active" },
    }),
  ]);

  console.log(
    `Data available: ${chunkCount} chunks, ${signalCount} signals, ${entityCount} entities`,
  );

  if (chunkCount === 0 && signalCount === 0) {
    console.error("No content data to synthesize. Seed data first.");
    process.exit(1);
  }

  // Reset wikiProcessedAt so all data gets processed
  await prisma.contentChunk.updateMany({
    where: { operatorId: operator.id },
    data: { wikiProcessedAt: null },
  });
  await prisma.activitySignal.updateMany({
    where: { operatorId: operator.id },
    data: { wikiProcessedAt: null },
  });

  // Delete existing wiki pages for clean test
  const deleted = await prisma.knowledgePage.deleteMany({
    where: { operatorId: operator.id },
  });
  console.log(`Cleaned ${deleted.count} existing wiki pages\n`);

  // Run onboarding synthesis
  console.log("Starting onboarding synthesis...\n");
  const startTime = Date.now();
  const report = await runBackgroundSynthesis(operator.id, {
    mode: "onboarding",
  });
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Synthesis Report ===`);
  console.log(`Duration: ${durationSec}s`);
  console.log(
    `Data processed: ${report.dataProcessed.chunks} chunks, ${report.dataProcessed.signals} signals`,
  );
  console.log(`Pages created: ${report.pagesCreated}`);
  console.log(`Pages updated: ${report.pagesUpdated}`);
  console.log(`Pages verified: ${report.pagesVerified}`);
  console.log(`Pages quarantined: ${report.pagesQuarantined}`);
  console.log(`Errors: ${report.errors}`);
  console.log(`Cost: ${report.costCents} cents`);

  // Report on wiki state
  const pages = await prisma.knowledgePage.findMany({
    where: { operatorId: operator.id },
    select: {
      slug: true,
      title: true,
      pageType: true,
      status: true,
      confidence: true,
      sourceCount: true,
      contentTokens: true,
      subjectEntityId: true,
    },
    orderBy: [{ pageType: "asc" }, { title: "asc" }],
  });

  console.log(`\n=== Wiki Pages (${pages.length} total) ===`);

  const byType = new Map<string, typeof pages>();
  for (const p of pages) {
    const group = byType.get(p.pageType) ?? [];
    group.push(p);
    byType.set(p.pageType, group);
  }

  for (const [type, pgs] of byType) {
    console.log(`\n  ${type} (${pgs.length}):`);
    for (const p of pgs) {
      const statusIcon =
        p.status === "verified"
          ? "V"
          : p.status === "quarantined"
            ? "X"
            : "o";
      console.log(
        `    ${statusIcon} ${p.title} -- ${p.sourceCount} sources, ${p.contentTokens} tokens, confidence: ${p.confidence.toFixed(2)}`,
      );
    }
  }

  // Entity coverage comparison (Part 2)
  const allBaseEntities = await prisma.entity.findMany({
    where: {
      operatorId: operator.id,
      category: "base",
      status: "active",
      entityType: { slug: { not: "ai-agent" } },
    },
    select: { id: true, displayName: true },
  });

  const entitiesWithWikiPages = pages.filter(
    (p) => p.pageType === "entity_profile" && p.subjectEntityId != null,
  );
  const wikiEntityIds = new Set(
    entitiesWithWikiPages.map((p) => p.subjectEntityId),
  );
  const covered = allBaseEntities.filter((e) => wikiEntityIds.has(e.id));
  const uncovered = allBaseEntities.filter((e) => !wikiEntityIds.has(e.id));

  console.log(`\n=== Entity Coverage ===`);
  console.log(`Total base entities (excl. AI agents): ${allBaseEntities.length}`);
  console.log(`Covered by wiki pages: ${covered.length}`);
  console.log(`Uncovered: ${uncovered.length}`);
  if (uncovered.length > 0 && uncovered.length <= 20) {
    console.log(
      `Uncovered entities: ${uncovered.map((e) => e.displayName).join(", ")}`,
    );
  }

  // Knowledge depth comparison (first 5 entities)
  if (covered.length > 0) {
    console.log(`\n=== Knowledge Depth (sample) ===`);
    for (const entity of covered.slice(0, 5)) {
      const propCount = await prisma.propertyValue.count({
        where: { entityId: entity.id },
      });

      const wikiPage = pages.find(
        (p) =>
          p.subjectEntityId === entity.id && p.pageType === "entity_profile",
      );

      console.log(
        `  ${entity.displayName}: ${propCount} properties vs ${wikiPage?.contentTokens ?? 0} wiki tokens (${wikiPage?.sourceCount ?? 0} sources)`,
      );
    }
  }

  // Validation checks
  console.log(`\n=== Validation ===`);

  const checks = [
    {
      name: "Entity profiles for team members",
      pass: (byType.get("entity_profile")?.length ?? 0) > 0,
      detail: `${byType.get("entity_profile")?.length ?? 0} entity profiles created`,
    },
    {
      name: "Department overviews",
      pass: (byType.get("department_overview")?.length ?? 0) > 0,
      detail: `${byType.get("department_overview")?.length ?? 0} department overviews created`,
    },
    {
      name: "Financial patterns",
      pass: (byType.get("financial_pattern")?.length ?? 0) > 0,
      detail: `${byType.get("financial_pattern")?.length ?? 0} financial pattern pages`,
    },
    {
      name: "Communication patterns",
      pass: (byType.get("communication_pattern")?.length ?? 0) > 0,
      detail: `${byType.get("communication_pattern")?.length ?? 0} communication pattern pages`,
    },
    {
      name: "Verification rate",
      pass: report.pagesVerified > report.pagesQuarantined,
      detail: `${report.pagesVerified} verified vs ${report.pagesQuarantined} quarantined`,
    },
    {
      name: "Source citations present",
      pass: pages.every(
        (p) =>
          p.sourceCount > 0 || ["index", "log"].includes(p.pageType),
      ),
      detail: `${pages.filter((p) => p.sourceCount === 0 && !["index", "log"].includes(p.pageType)).length} pages without sources`,
    },
    {
      name: "No errors during synthesis",
      pass: report.errors === 0,
      detail: `${report.errors} errors`,
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? "PASS" : "FAIL";
    console.log(`  ${icon} ${check.name}: ${check.detail}`);
    if (!check.pass) allPassed = false;
  }

  console.log(
    `\n${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`,
  );

  // Sample a page's content for manual review
  const samplePage = pages.find(
    (p) => p.pageType === "entity_profile" && p.status === "verified",
  );
  if (samplePage) {
    const full = await prisma.knowledgePage.findUnique({
      where: {
        operatorId_slug: { operatorId: operator.id, slug: samplePage.slug },
      },
      select: { content: true },
    });
    console.log(`\n=== Sample Page: ${samplePage.title} ===`);
    console.log(full?.content?.slice(0, 1000) ?? "(no content)");
    if ((full?.content?.length ?? 0) > 1000) console.log("... (truncated)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
