-- Drop ConnectorDepartmentBinding first (has FK to SourceConnector)
DROP TABLE IF EXISTS "ConnectorDepartmentBinding";

-- Wipe all connector-related data (no customers, clean slate)
DELETE FROM "ContentChunk" WHERE "sourceType" != 'uploaded_doc';
DELETE FROM "ActivitySignal";
DELETE FROM "SyncLog";
DELETE FROM "Event";
DELETE FROM "ActionCapability" WHERE "connectorId" IS NOT NULL;
DELETE FROM "SourceConnector";

-- Add userId to SourceConnector (null = company connector, set = personal)
ALTER TABLE "SourceConnector" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE;
