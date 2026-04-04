-- Deploy: prisma migrate deploy (or manual apply on bastion)
-- Note: ContentChunk has a vector column managed via raw SQL.
-- Shadow DB may fail. Apply this migration manually if needed.

-- AlterTable: Add projectId to ContentChunk
ALTER TABLE "ContentChunk" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContentChunk_operatorId_projectId_idx" ON "ContentChunk"("operatorId", "projectId");

-- AlterTable: Add compilation fields to Project
ALTER TABLE "Project" ADD COLUMN "knowledgeIndex" JSONB;
ALTER TABLE "Project" ADD COLUMN "compilationStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "compiledAt" TIMESTAMP(3);

-- AlterTable: Add projectId to InternalDocument
ALTER TABLE "InternalDocument" ADD COLUMN "projectId" TEXT;
ALTER TABLE "InternalDocument" ADD CONSTRAINT "InternalDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
