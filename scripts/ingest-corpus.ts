/**
 * Ingest a folder of research documents into the corpus pipeline.
 *
 * Usage:
 *   npx tsx scripts/ingest-corpus.ts --folder ./research/dd --vertical "buy-side-due-diligence"
 *   npx tsx scripts/ingest-corpus.ts --folder ./research/dd --vertical "buy-side-due-diligence" --dry-run
 *   npx tsx scripts/ingest-corpus.ts --folder ./research/dd --vertical "buy-side-due-diligence" --plan-only
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";
import { processResearchCorpus, type CorpusDocument } from "@/lib/research-corpus-pipeline";

const args = process.argv.slice(2);
const folderIdx = args.indexOf("--folder");
const verticalIdx = args.indexOf("--vertical");
const dryRun = args.includes("--dry-run");
const planOnly = args.includes("--plan-only");

if (folderIdx === -1 || verticalIdx === -1) {
  console.error("Usage: npx tsx scripts/ingest-corpus.ts --folder <path> --vertical <name> [--dry-run] [--plan-only]");
  process.exit(1);
}

const folder = args[folderIdx + 1];
const vertical = args[verticalIdx + 1];

// Read all markdown/text files from the folder
const files = readdirSync(folder)
  .filter(f => [".md", ".txt", ".markdown"].includes(extname(f).toLowerCase()))
  .filter(f => statSync(join(folder, f)).isFile())
  .sort();

if (files.length === 0) {
  console.error(`No .md/.txt files found in ${folder}`);
  process.exit(1);
}

const documents: CorpusDocument[] = files.map((f, i) => ({
  id: `doc-${String(i + 1).padStart(3, "0")}`,
  title: basename(f, extname(f)).replace(/[-_]/g, " "),
  content: readFileSync(join(folder, f), "utf-8"),
}));

console.log(`Loaded ${documents.length} documents from ${folder}`);
console.log(`Vertical: ${vertical}`);
console.log(`Mode: ${dryRun ? "dry-run" : planOnly ? "plan-only" : "full pipeline"}`);
console.log(`Documents:`);
for (const doc of documents) {
  console.log(`  ${doc.id}: "${doc.title}" (${Math.ceil(doc.content.length / 4)} tokens)`);
}
console.log();

async function main() {
  const report = await processResearchCorpus(documents, vertical, {
    dryRun,
    adminReviewPlan: planOnly,
    onProgress: async (phase, message) => {
      console.log(`[${phase}] ${message}`);
    },
  });

  console.log();
  console.log("═══ Pipeline Report ═══");
  console.log(`Phase: ${report.phase}`);
  console.log(`Documents classified: ${report.documentsClassified}`);
  console.log(`Domains planned: ${report.domainsPlanned}`);
  console.log(`Pages planned: ${report.pagesPlanned}`);
  console.log(`Pages synthesized: ${report.pagesSynthesized}`);
  console.log(`Pages from audit: ${report.pagesFromAudit}`);
  console.log(`Cross-references resolved: ${report.crossReferencesResolved}`);
  console.log(`Cost: $${(report.totalCostCents / 100).toFixed(2)}`);
  console.log(`Duration: ${Math.round(report.durationMs / 1000)}s`);
  if (report.errors.length > 0) {
    console.log(`Errors (${report.errors.length}):`);
    for (const err of report.errors) console.log(`  - ${err}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
