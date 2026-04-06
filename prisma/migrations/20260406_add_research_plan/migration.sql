-- CreateTable
CREATE TABLE "ResearchPlan" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "investigations" JSONB NOT NULL,
    "priorityOrder" JSONB NOT NULL,
    "planningReasoning" TEXT,
    "estimatedDurationMinutes" INTEGER,
    "estimatedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchPlan_operatorId_idx" ON "ResearchPlan"("operatorId");

-- AddForeignKey
ALTER TABLE "ResearchPlan" ADD CONSTRAINT "ResearchPlan_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
