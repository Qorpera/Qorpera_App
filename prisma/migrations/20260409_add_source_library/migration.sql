-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "domain" TEXT,
    "domains" TEXT[],
    "sourceType" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "fileUploadId" TEXT,
    "rawText" TEXT,
    "rawMarkdown" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "sectionCount" INTEGER,
    "pagesProduced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "publicationYear" INTEGER,
    "isbn" TEXT,
    "version" TEXT,
    "supersededById" TEXT,
    "notes" TEXT,
    "lastIntegrityCheck" TIMESTAMP(3),
    "integrityStatus" TEXT,
    "integrityNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSection" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleHierarchy" TEXT[],
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "pageRange" TEXT,
    "sectionType" TEXT NOT NULL DEFAULT 'content',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pagesProduced" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "SourceSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityCheck" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "pagesChecked" INTEGER NOT NULL,
    "issuesFound" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,
    "modelUsed" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "costCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityCheck_pkey" PRIMARY KEY ("id")
);

-- Add source tracing fields to KnowledgePage
ALTER TABLE "KnowledgePage" ADD COLUMN "sourceAuthority" TEXT;
ALTER TABLE "KnowledgePage" ADD COLUMN "sourceDocumentId" TEXT;
ALTER TABLE "KnowledgePage" ADD COLUMN "sourceDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "KnowledgePage" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "KnowledgePage" ADD COLUMN "sourceReferences" JSONB;
ALTER TABLE "KnowledgePage" ADD COLUMN "stagingStatus" TEXT;
ALTER TABLE "KnowledgePage" ADD COLUMN "stagingReviewedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgePage" ADD COLUMN "stagingReviewNote" TEXT;
ALTER TABLE "KnowledgePage" ADD COLUMN "lastIntegrityCheck" TIMESTAMP(3);
ALTER TABLE "KnowledgePage" ADD COLUMN "integrityStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_fileUploadId_key" ON "SourceDocument"("fileUploadId");
CREATE INDEX "SourceDocument_sourceType_idx" ON "SourceDocument"("sourceType");
CREATE INDEX "SourceDocument_sourceAuthority_idx" ON "SourceDocument"("sourceAuthority");
CREATE INDEX "SourceDocument_status_idx" ON "SourceDocument"("status");
CREATE INDEX "SourceDocument_domain_idx" ON "SourceDocument"("domain");
CREATE INDEX "SourceDocument_integrityStatus_idx" ON "SourceDocument"("integrityStatus");

CREATE UNIQUE INDEX "SourceSection_sourceId_sectionIndex_key" ON "SourceSection"("sourceId", "sectionIndex");
CREATE INDEX "SourceSection_sourceId_idx" ON "SourceSection"("sourceId");
CREATE INDEX "SourceSection_contentHash_idx" ON "SourceSection"("contentHash");

CREATE INDEX "IntegrityCheck_sourceId_idx" ON "IntegrityCheck"("sourceId");
CREATE INDEX "IntegrityCheck_status_idx" ON "IntegrityCheck"("status");
CREATE INDEX "IntegrityCheck_createdAt_idx" ON "IntegrityCheck"("createdAt");

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_fileUploadId_fkey" FOREIGN KEY ("fileUploadId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SourceSection" ADD CONSTRAINT "SourceSection_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrityCheck" ADD CONSTRAINT "IntegrityCheck_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgePage" ADD CONSTRAINT "KnowledgePage_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
