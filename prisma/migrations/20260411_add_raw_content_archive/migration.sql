-- Raw Content Archive: stores full, unchunked content from connectors

CREATE TABLE "RawContent" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "contentHash" TEXT,
    "rawBody" TEXT,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawContent_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one record per source item per operator
CREATE UNIQUE INDEX "RawContent_operatorId_sourceType_sourceId_key" ON "RawContent"("operatorId", "sourceType", "sourceId");

-- Query indexes
CREATE INDEX "RawContent_operatorId_sourceType_idx" ON "RawContent"("operatorId", "sourceType");
CREATE INDEX "RawContent_operatorId_accountId_idx" ON "RawContent"("operatorId", "accountId");
CREATE INDEX "RawContent_operatorId_occurredAt_idx" ON "RawContent"("operatorId", "occurredAt");
CREATE INDEX "RawContent_contentHash_idx" ON "RawContent"("contentHash");

-- Foreign keys
ALTER TABLE "RawContent" ADD CONSTRAINT "RawContent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RawContent" ADD CONSTRAINT "RawContent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SourceConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
