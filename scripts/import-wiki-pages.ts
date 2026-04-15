/**
 * Import existing wiki markdown files into the Source Library + KnowledgePage.
 *
 * Usage: npx tsx scripts/import-wiki-pages.ts
 *
 * Creates a SourceDocument for each file and a KnowledgePage with embedding.
 * Pages are created as approved (visible to reasoning immediately).
 * Skips files where a system page with the same slug already exists.
 */

import { prisma } from "@/lib/db";
import { embedTexts } from "@/lib/wiki-embedder";
import * as fs from "fs";
import * as path from "path";

async function importFolder(folderPath: string, domain: string) {
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} markdown files in ${folderPath} (domain: ${domain})`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract title from first # header, fallback to filename
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file.replace(".md", "").replace(/-/g, " ");

    // Slug from filename
    const slug = file.replace(".md", "").toLowerCase().replace(/\s+/g, "-");

    // Extract [[cross-references]]
    const crossRefs = [...new Set(
      (content.match(/\[\[([^\]]+)\]\]/g) || []).map(m => m.slice(2, -2))
    )];

    // Check for existing page with same slug (system-scoped)
    const existing = await prisma.knowledgePage.findFirst({
      where: { slug, scope: "system" },
      select: { id: true },
    });
    if (existing) {
      console.log(`  SKIP (exists): ${slug}`);
      skipped++;
      continue;
    }

    try {
      // Create SourceDocument
      const source = await prisma.sourceDocument.create({
        data: {
          title,
          domain,
          domains: [domain],
          sourceType: "expert_doc",
          sourceAuthority: "foundational",
          rawMarkdown: content,
          status: "complete",
          pagesProduced: 1,
        },
        select: { id: true },
      });

      // Generate embedding
      const embeddings = await embedTexts([content]).catch(() => [null]);
      const embedding = embeddings[0];

      // Create KnowledgePage
      const page = await prisma.knowledgePage.create({
        data: {
          operatorId: null,
          scope: "system",
          slug,
          title,
          pageType: "topic_synthesis",
          content,
          contentTokens: Math.ceil(content.length / 4),
          crossReferences: crossRefs,
          status: "draft",
          stagingStatus: "approved",
          sourceAuthority: "foundational",
          sourceDocumentId: source.id,
          sourceDocumentIds: [source.id],
          sourceReference: `${title} (${domain} wiki)`,
          sourceReferences: [{
            sourceDocumentId: source.id,
            reference: `${title} (${domain} wiki)`,
            claimSummary: title,
            authority: "foundational",
          }],
          synthesisPath: "manual",
          synthesizedByModel: "human",
          confidence: 0.85,
          sourceCount: 1,
          sourceTypes: ["expert_doc"],
          sources: [{ type: "source_document", id: source.id, citation: title }],
          lastSynthesizedAt: new Date(),
          version: 1,
        },
        select: { id: true },
      });

      // Set embedding via raw SQL (pgvector)
      if (embedding) {
        const embeddingStr = `[${embedding.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
          embeddingStr,
          page.id,
        );
      }

      console.log(`  OK ${slug} (${crossRefs.length} refs${embedding ? ", embedded" : ", NO embedding"})`);
      imported++;
    } catch (err) {
      console.error(`  ERROR ${slug}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`  ${domain}: ${imported} imported, ${skipped} skipped, ${errors} errors\n`);
  return { imported, skipped, errors };
}

async function main() {
  const folders: [string, string][] = [
    ["/home/krug3r/Desktop/TDD-Wiki", "TDD"],
    ["/home/krug3r/Desktop/MAA-Wiki", "MAA"],
  ];

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [folder, domain] of folders) {
    if (!fs.existsSync(folder)) {
      console.error(`Folder not found: ${folder}`);
      continue;
    }
    const result = await importFolder(folder, domain);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  // Summary
  const totalSources = await prisma.sourceDocument.count({ where: { sourceType: "expert_doc" } });
  const totalPages = await prisma.knowledgePage.count({ where: { scope: "system", synthesisPath: "manual" } });
  console.log(`Done. ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors.`);
  console.log(`Total: ${totalSources} expert_doc sources, ${totalPages} manual wiki pages.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
