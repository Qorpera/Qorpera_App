-- Add consecutiveFailures counter to SourceConnector for sync scheduler failure tracking
ALTER TABLE "SourceConnector" ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
