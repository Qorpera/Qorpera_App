-- AlterTable: add connectorId to ContentChunk
ALTER TABLE "ContentChunk" ADD COLUMN "connectorId" TEXT;

-- CreateIndex
CREATE INDEX "ContentChunk_connectorId_idx" ON "ContentChunk"("connectorId");

-- AddForeignKey
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "SourceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
