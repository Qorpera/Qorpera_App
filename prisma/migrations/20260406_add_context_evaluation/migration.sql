-- CreateTable
CREATE TABLE "ContextEvaluation" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "contextSections" JSONB NOT NULL,
    "citedSections" JSONB NOT NULL,
    "outcome" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContextEvaluation_operatorId_idx" ON "ContextEvaluation"("operatorId");

-- CreateIndex
CREATE INDEX "ContextEvaluation_situationId_idx" ON "ContextEvaluation"("situationId");

-- AddForeignKey
ALTER TABLE "ContextEvaluation" ADD CONSTRAINT "ContextEvaluation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextEvaluation" ADD CONSTRAINT "ContextEvaluation_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
