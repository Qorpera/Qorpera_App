-- AlterTable: add parentProjectId to Project
ALTER TABLE "Project" ADD COLUMN "parentProjectId" TEXT;
CREATE INDEX "Project_parentProjectId_idx" ON "Project"("parentProjectId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WikiBookmark" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageSlug" TEXT NOT NULL,
    "bookmarkType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "subjectHint" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedAction" TEXT,
    "resolvedInitiativeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiBookmark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiBookmark_operatorId_resolved_idx" ON "WikiBookmark"("operatorId", "resolved");
CREATE INDEX "WikiBookmark_operatorId_bookmarkType_idx" ON "WikiBookmark"("operatorId", "bookmarkType");
CREATE INDEX "WikiBookmark_pageId_idx" ON "WikiBookmark"("pageId");

ALTER TABLE "WikiBookmark" ADD CONSTRAINT "WikiBookmark_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiBookmark" ADD CONSTRAINT "WikiBookmark_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiBookmark" ADD CONSTRAINT "WikiBookmark_resolvedInitiativeId_fkey" FOREIGN KEY ("resolvedInitiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
