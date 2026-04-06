-- AlterTable: add trustLevel to KnowledgePage
ALTER TABLE "KnowledgePage" ADD COLUMN "trustLevel" TEXT NOT NULL DEFAULT 'provisional';

-- CreateTable
CREATE TABLE "KnowledgePageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "changeReason" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgePageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePageVersion_pageId_versionNumber_key" ON "KnowledgePageVersion"("pageId", "versionNumber");

-- CreateIndex
CREATE INDEX "KnowledgePageVersion_pageId_idx" ON "KnowledgePageVersion"("pageId");

-- AddForeignKey
ALTER TABLE "KnowledgePageVersion" ADD CONSTRAINT "KnowledgePageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
