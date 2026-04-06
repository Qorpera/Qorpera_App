-- CreateTable
CREATE TABLE "EvidenceExtraction" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sourceChunkId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "extractions" JSONB NOT NULL,
    "relationships" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "extractedBy" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceExtraction_operatorId_idx" ON "EvidenceExtraction"("operatorId");

-- CreateIndex
CREATE INDEX "EvidenceExtraction_sourceChunkId_idx" ON "EvidenceExtraction"("sourceChunkId");

-- CreateIndex
CREATE INDEX "EvidenceExtraction_operatorId_sourceType_idx" ON "EvidenceExtraction"("operatorId", "sourceType");

-- AddForeignKey
ALTER TABLE "EvidenceExtraction" ADD CONSTRAINT "EvidenceExtraction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceExtraction" ADD CONSTRAINT "EvidenceExtraction_sourceChunkId_fkey" FOREIGN KEY ("sourceChunkId") REFERENCES "ContentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
