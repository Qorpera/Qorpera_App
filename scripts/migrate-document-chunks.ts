/**
 * Data migration: DocumentChunk → ContentChunk
 *
 * NOTE: This script uses raw SQL because the DocumentChunk model has been
 * removed from the Prisma schema. Run this ONLY if you have an existing
 * database with DocumentChunk data that hasn't been migrated yet.
 *
 * Safe to run multiple times — inserts new ContentChunk rows each time,
 * so only run once per database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface RawDocumentChunk {
  id: string;
  entityId: string;
  operatorId: string;
  chunkIndex: number;
  content: string;
  embedding: string | null;
  tokenCount: number | null;
}

interface RawDocInfo {
  entityId: string;
  docId: string;
  fileName: string;
  documentType: string;
  departmentId: string | null;
}

async function main() {
  // Check if DocumentChunk table still exists
  const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'DocumentChunk'
    )
  `;
  if (!tableCheck[0]?.exists) {
    console.log("DocumentChunk table does not exist — nothing to migrate.");
    return;
  }

  const chunks = await prisma.$queryRaw<RawDocumentChunk[]>`
    SELECT id, "entityId", "operatorId", "chunkIndex", content, embedding, "tokenCount"
    FROM "DocumentChunk"
  `;

  if (chunks.length === 0) {
    console.log("No DocumentChunk records to migrate.");
    return;
  }

  console.log(`Found ${chunks.length} DocumentChunk records to migrate.`);

  // Build a map of entityId → InternalDocument info
  const entityIds = [...new Set(chunks.map((c) => c.entityId))];
  const docs = await prisma.$queryRaw<RawDocInfo[]>`
    SELECT "entityId", id as "docId", "fileName", "documentType", "departmentId"
    FROM "InternalDocument"
    WHERE "entityId" = ANY(${entityIds})
  `;
  const docMap = new Map(docs.map((d) => [d.entityId, d]));

  // Also get parentDepartmentId from Entity as fallback
  const entities = await prisma.$queryRaw<Array<{ id: string; parentDepartmentId: string | null }>>`
    SELECT id, "parentDepartmentId" FROM "Entity" WHERE id = ANY(${entityIds})
  `;
  const entityDeptMap = new Map(entities.map((e) => [e.id, e.parentDepartmentId]));

  let migrated = 0;

  for (const chunk of chunks) {
    const doc = docMap.get(chunk.entityId);
    const sourceId = doc?.docId ?? chunk.entityId;
    const deptId = doc?.departmentId ?? entityDeptMap.get(chunk.entityId) ?? null;
    const departmentIds = deptId ? JSON.stringify([deptId]) : null;
    const metadata = doc
      ? JSON.stringify({ fileName: doc.fileName, documentType: doc.documentType })
      : null;

    // Insert ContentChunk (select only id to avoid vector deserialization error)
    const created = await prisma.contentChunk.create({
      data: {
        operatorId: chunk.operatorId,
        sourceType: "uploaded_doc",
        sourceId,
        entityId: chunk.entityId,
        departmentIds,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata,
      },
      select: { id: true },
    });

    // Convert embedding if present (stored as JSON string in old table)
    if (chunk.embedding) {
      try {
        const embeddingArray = JSON.parse(chunk.embedding) as number[];
        const vectorLiteral = `[${embeddingArray.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`,
          vectorLiteral,
          created.id,
        );
      } catch (err) {
        console.warn(`  Warning: failed to convert embedding for chunk ${chunk.id}:`, err);
      }
    }

    migrated++;
    if (migrated % 50 === 0 || migrated === chunks.length) {
      console.log(`Migrated ${migrated}/${chunks.length} chunks`);
    }
  }

  console.log(`\nDone. Migrated ${migrated} chunks.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
