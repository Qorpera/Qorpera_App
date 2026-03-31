-- CreateTable
CREATE TABLE "SituationCycle" (
    "id" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerSummary" TEXT NOT NULL,
    "triggerData" JSONB,
    "reasoning" JSONB,
    "executionPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SituationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SituationCycle_executionPlanId_key" ON "SituationCycle"("executionPlanId");

-- CreateIndex
CREATE INDEX "SituationCycle_situationId_cycleNumber_idx" ON "SituationCycle"("situationId", "cycleNumber");

-- CreateIndex
CREATE INDEX "SituationCycle_situationId_status_idx" ON "SituationCycle"("situationId", "status");

-- AddForeignKey
ALTER TABLE "SituationCycle" ADD CONSTRAINT "SituationCycle_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituationCycle" ADD CONSTRAINT "SituationCycle_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: WorkerJob — add correlationId
ALTER TABLE "WorkerJob" ADD COLUMN "correlationId" TEXT;

-- CreateIndex
CREATE INDEX "WorkerJob_correlationId_status_idx" ON "WorkerJob"("correlationId", "status");
