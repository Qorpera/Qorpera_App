-- CreateTable
CREATE TABLE "KnowledgePage" (
  "id" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "projectId" TEXT,
  "pageType" TEXT NOT NULL,
  "subjectEntityId" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentTokens" INTEGER NOT NULL DEFAULT 0,
  "crossReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sources" JSONB NOT NULL DEFAULT '[]',
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "sourceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'draft',
  "verifiedAt" TIMESTAMP(3),
  "verifiedByModel" TEXT,
  "verificationLog" JSONB,
  "quarantineReason" TEXT,
  "staleReason" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "reasoningUseCount" INTEGER NOT NULL DEFAULT 0,
  "outcomeApproved" INTEGER NOT NULL DEFAULT 0,
  "outcomeRejected" INTEGER NOT NULL DEFAULT 0,
  "citedByPages" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "synthesisPath" TEXT NOT NULL,
  "synthesizedByModel" TEXT NOT NULL,
  "synthesisPromptHash" TEXT,
  "synthesisCostCents" INTEGER,
  "synthesisDurationMs" INTEGER,
  "situationId" TEXT,
  "lastSynthesizedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "embedding" vector(1536),
  CONSTRAINT "KnowledgePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePage_operatorId_slug_key" ON "KnowledgePage"("operatorId", "slug");
CREATE UNIQUE INDEX "KnowledgePage_operatorId_projectId_subjectEntityId_pageType_key" ON "KnowledgePage"("operatorId", "projectId", "subjectEntityId", "pageType");
CREATE INDEX "KnowledgePage_operatorId_status_idx" ON "KnowledgePage"("operatorId", "status");
CREATE INDEX "KnowledgePage_operatorId_pageType_idx" ON "KnowledgePage"("operatorId", "pageType");
CREATE INDEX "KnowledgePage_operatorId_projectId_idx" ON "KnowledgePage"("operatorId", "projectId");
CREATE INDEX "KnowledgePage_subjectEntityId_idx" ON "KnowledgePage"("subjectEntityId");

-- AddForeignKey
ALTER TABLE "KnowledgePage" ADD CONSTRAINT "KnowledgePage_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add wikiProcessedAt to ContentChunk and ActivitySignal
ALTER TABLE "ContentChunk" ADD COLUMN "wikiProcessedAt" TIMESTAMP(3);
ALTER TABLE "ActivitySignal" ADD COLUMN "wikiProcessedAt" TIMESTAMP(3);
