-- FileUpload: document intelligence pipeline fields
ALTER TABLE "FileUpload" ADD COLUMN "extractedFullText" TEXT;
ALTER TABLE "FileUpload" ADD COLUMN "documentProfile" JSONB;
ALTER TABLE "FileUpload" ADD COLUMN "documentUnderstanding" JSONB;
ALTER TABLE "FileUpload" ADD COLUMN "intelligenceStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "FileUpload" ADD COLUMN "intelligenceError" TEXT;
ALTER TABLE "FileUpload" ADD COLUMN "intelligenceCostCents" INTEGER NOT NULL DEFAULT 0;

-- EvidenceExtraction: document context and analytical claims
ALTER TABLE "EvidenceExtraction" ADD COLUMN "documentContext" JSONB;
ALTER TABLE "EvidenceExtraction" ADD COLUMN "analyticalClaims" JSONB;
ALTER TABLE "EvidenceExtraction" ADD COLUMN "correlationId" TEXT;

-- CorrelationFinding: cross-document correlation results
CREATE TABLE "CorrelationFinding" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "significance" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "primarySourceId" TEXT NOT NULL,
    "correlatedSourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "implications" TEXT,
    "resolvedInWikiSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrelationFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorrelationFinding_operatorId_idx" ON "CorrelationFinding"("operatorId");
CREATE INDEX "CorrelationFinding_operatorId_type_idx" ON "CorrelationFinding"("operatorId", "type");
CREATE INDEX "CorrelationFinding_operatorId_significance_idx" ON "CorrelationFinding"("operatorId", "significance");

ALTER TABLE "CorrelationFinding" ADD CONSTRAINT "CorrelationFinding_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AnalysisPromptVersion: quality feedback loop for prompts
CREATE TABLE "AnalysisPromptVersion" (
    "id" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "mutation" TEXT,
    "pagesProduced" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION,
    "citationRate" DOUBLE PRECISION,
    "approvalRate" DOUBLE PRECISION,
    "analyticalDepth" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deployedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalysisPromptVersion_promptType_status_idx" ON "AnalysisPromptVersion"("promptType", "status");
CREATE INDEX "AnalysisPromptVersion_promptType_version_idx" ON "AnalysisPromptVersion"("promptType", "version");
