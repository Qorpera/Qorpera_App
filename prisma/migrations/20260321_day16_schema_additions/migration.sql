-- Day 16: Schema additions for detection upgrades and instrumentation

-- ExecutionStep: retry tracking
ALTER TABLE "ExecutionStep" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExecutionStep" ADD COLUMN "lastError" TEXT;

-- SituationType: detection counters and prompt versioning
ALTER TABLE "SituationType" ADD COLUMN "detectedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SituationType" ADD COLUMN "confirmedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SituationType" ADD COLUMN "dismissedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SituationType" ADD COLUMN "promptVersion" INTEGER NOT NULL DEFAULT 1;

-- ExecutionPlan: track if plan was modified before approval
ALTER TABLE "ExecutionPlan" ADD COLUMN "modifiedBeforeApproval" BOOLEAN NOT NULL DEFAULT false;
