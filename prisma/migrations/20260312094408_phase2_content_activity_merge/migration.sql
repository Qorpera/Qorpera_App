-- CreateTable
CREATE TABLE "ContentChunk" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entityId" TEXT,
    "departmentIds" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "tokenCount" INTEGER,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySignal" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "connectorId" TEXT,
    "signalType" TEXT NOT NULL,
    "actorEntityId" TEXT,
    "targetEntityIds" TEXT,
    "departmentIds" TEXT,
    "metadata" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityMergeLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "survivorId" TEXT NOT NULL,
    "absorbedId" TEXT NOT NULL,
    "mergeType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "signals" TEXT,
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentChunk_operatorId_sourceType_idx" ON "ContentChunk"("operatorId", "sourceType");

-- CreateIndex
CREATE INDEX "ContentChunk_entityId_idx" ON "ContentChunk"("entityId");

-- CreateIndex
CREATE INDEX "ContentChunk_operatorId_sourceId_idx" ON "ContentChunk"("operatorId", "sourceId");

-- CreateIndex
CREATE INDEX "ActivitySignal_operatorId_signalType_occurredAt_idx" ON "ActivitySignal"("operatorId", "signalType", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ActivitySignal_operatorId_actorEntityId_occurredAt_idx" ON "ActivitySignal"("operatorId", "actorEntityId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ActivitySignal_operatorId_occurredAt_idx" ON "ActivitySignal"("operatorId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "EntityMergeLog_operatorId_createdAt_idx" ON "EntityMergeLog"("operatorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EntityMergeLog_operatorId_mergeType_idx" ON "EntityMergeLog"("operatorId", "mergeType");

-- AddForeignKey
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySignal" ADD CONSTRAINT "ActivitySignal_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMergeLog" ADD CONSTRAINT "EntityMergeLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
