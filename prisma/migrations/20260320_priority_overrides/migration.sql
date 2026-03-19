CREATE TABLE "PriorityOverride" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "operatorId" TEXT NOT NULL,
    "executionPlanId" TEXT NOT NULL,
    "overrideType" TEXT NOT NULL,
    "snoozeUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriorityOverride_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriorityOverride_executionPlanId_key" UNIQUE ("executionPlanId")
);

ALTER TABLE "PriorityOverride" ADD CONSTRAINT "PriorityOverride_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE;
ALTER TABLE "PriorityOverride" ADD CONSTRAINT "PriorityOverride_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE;
ALTER TABLE "PriorityOverride" ADD CONSTRAINT "PriorityOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE;
