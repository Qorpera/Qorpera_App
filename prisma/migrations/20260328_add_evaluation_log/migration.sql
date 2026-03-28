-- CreateTable
CREATE TABLE "EvaluationLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "actorEntityId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "summary" TEXT,
    "reasoning" TEXT,
    "urgency" TEXT,
    "confidence" DOUBLE PRECISION,
    "situationId" TEXT,
    "metadata" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationLog_operatorId_evaluatedAt_idx" ON "EvaluationLog"("operatorId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "EvaluationLog_operatorId_classification_idx" ON "EvaluationLog"("operatorId", "classification");

-- CreateIndex
CREATE INDEX "EvaluationLog_operatorId_actorEntityId_idx" ON "EvaluationLog"("operatorId", "actorEntityId");
