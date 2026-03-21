-- Connector hardening: soft delete + health tracking
ALTER TABLE "SourceConnector" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "SourceConnector" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "SourceConnector" ADD COLUMN "healthStatus" TEXT NOT NULL DEFAULT 'healthy';
ALTER TABLE "SourceConnector" ADD COLUMN "lastHealthCheck" TIMESTAMP(3);
ALTER TABLE "SourceConnector" ADD COLUMN "lastError" TEXT;
