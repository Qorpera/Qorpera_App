-- Add unique constraint on FileUpload(operatorId, storageProvider, storageKey)
-- Prevents duplicate FileUpload records for the same connector document on re-sync
CREATE UNIQUE INDEX "FileUpload_operatorId_storageProvider_storageKey_key"
  ON "FileUpload"("operatorId", "storageProvider", "storageKey");
