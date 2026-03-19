-- Phase 3: Goals & Execution models

-- Entity: add ownerDepartmentId
ALTER TABLE "Entity" ADD COLUMN "ownerDepartmentId" TEXT;
CREATE UNIQUE INDEX "Entity_ownerDepartmentId_key" ON "Entity"("ownerDepartmentId");

-- Situation: add executionPlanId, workStreamId
ALTER TABLE "Situation" ADD COLUMN "executionPlanId" TEXT;
ALTER TABLE "Situation" ADD COLUMN "workStreamId" TEXT;
CREATE UNIQUE INDEX "Situation_executionPlanId_key" ON "Situation"("executionPlanId");

-- Goal
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "measurableTarget" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_operatorId_status_idx" ON "Goal"("operatorId", "status");
CREATE INDEX "Goal_operatorId_departmentId_idx" ON "Goal"("operatorId", "departmentId");

-- Initiative
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "aiEntityId" TEXT NOT NULL,
    "executionPlanId" TEXT,
    "workStreamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "rationale" TEXT NOT NULL,
    "impactAssessment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Initiative_executionPlanId_key" ON "Initiative"("executionPlanId");
CREATE INDEX "Initiative_operatorId_status_idx" ON "Initiative"("operatorId", "status");
CREATE INDEX "Initiative_goalId_idx" ON "Initiative"("goalId");
CREATE INDEX "Initiative_workStreamId_idx" ON "Initiative"("workStreamId");

-- ExecutionPlan
CREATE TABLE "ExecutionPlan" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "priorityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutionPlan_operatorId_status_idx" ON "ExecutionPlan"("operatorId", "status");
CREATE INDEX "ExecutionPlan_operatorId_sourceType_sourceId_idx" ON "ExecutionPlan"("operatorId", "sourceType", "sourceId");

-- ExecutionStep
CREATE TABLE "ExecutionStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "actionCapabilityId" TEXT,
    "assignedUserId" TEXT,
    "inputContext" TEXT,
    "outputResult" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "originalDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExecutionStep_planId_sequenceOrder_key" ON "ExecutionStep"("planId", "sequenceOrder");
CREATE INDEX "ExecutionStep_planId_status_idx" ON "ExecutionStep"("planId", "status");

-- WorkStream
CREATE TABLE "WorkStream" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goalId" TEXT,
    "ownerAiEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "parentWorkStreamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkStream_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkStream_operatorId_status_idx" ON "WorkStream"("operatorId", "status");

-- Delegation
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "fromAiEntityId" TEXT NOT NULL,
    "toAiEntityId" TEXT,
    "toUserId" TEXT,
    "workStreamId" TEXT,
    "situationId" TEXT,
    "initiativeId" TEXT,
    "instruction" TEXT NOT NULL,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "returnReason" TEXT,
    "completedNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Delegation_operatorId_status_idx" ON "Delegation"("operatorId", "status");
CREATE INDEX "Delegation_toUserId_status_idx" ON "Delegation"("toUserId", "status");
CREATE INDEX "Delegation_toAiEntityId_status_idx" ON "Delegation"("toAiEntityId", "status");

-- FollowUp
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "executionStepId" TEXT NOT NULL,
    "situationId" TEXT,
    "triggerCondition" TEXT NOT NULL,
    "fallbackAction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'watching',
    "triggerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredAt" TIMESTAMP(3),

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUp_executionStepId_key" ON "FollowUp"("executionStepId");
CREATE INDEX "FollowUp_operatorId_status_idx" ON "FollowUp"("operatorId", "status");
CREATE INDEX "FollowUp_status_triggerAt_idx" ON "FollowUp"("status", "triggerAt");

-- RecurringTask
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "aiEntityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cronExpression" TEXT NOT NULL,
    "executionPlanTemplate" TEXT NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3),
    "nextTriggerAt" TIMESTAMP(3),
    "autoApproveSteps" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringTask_operatorId_status_idx" ON "RecurringTask"("operatorId", "status");
CREATE INDEX "RecurringTask_status_nextTriggerAt_idx" ON "RecurringTask"("status", "nextTriggerAt");

-- PlanAutonomy
CREATE TABLE "PlanAutonomy" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "aiEntityId" TEXT NOT NULL,
    "planPatternHash" TEXT NOT NULL,
    "consecutiveApprovals" INTEGER NOT NULL DEFAULT 0,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanAutonomy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanAutonomy_aiEntityId_planPatternHash_key" ON "PlanAutonomy"("aiEntityId", "planPatternHash");
CREATE INDEX "PlanAutonomy_operatorId_idx" ON "PlanAutonomy"("operatorId");

-- OperationalInsight
CREATE TABLE "OperationalInsight" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "aiEntityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "insightType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "shareScope" TEXT NOT NULL DEFAULT 'personal',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalInsight_operatorId_shareScope_status_idx" ON "OperationalInsight"("operatorId", "shareScope", "status");
CREATE INDEX "OperationalInsight_aiEntityId_status_idx" ON "OperationalInsight"("aiEntityId", "status");
CREATE INDEX "OperationalInsight_operatorId_departmentId_status_idx" ON "OperationalInsight"("operatorId", "departmentId", "status");

-- NotificationPreference
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'both',

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_key" ON "NotificationPreference"("userId", "notificationType");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- Foreign keys
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_workStreamId_fkey" FOREIGN KEY ("workStreamId") REFERENCES "WorkStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionStep" ADD CONSTRAINT "ExecutionStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkStream" ADD CONSTRAINT "WorkStream_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkStream" ADD CONSTRAINT "WorkStream_parentWorkStreamId_fkey" FOREIGN KEY ("parentWorkStreamId") REFERENCES "WorkStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_executionStepId_fkey" FOREIGN KEY ("executionStepId") REFERENCES "ExecutionStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanAutonomy" ADD CONSTRAINT "PlanAutonomy_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalInsight" ADD CONSTRAINT "OperationalInsight_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Situation" ADD CONSTRAINT "Situation_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Situation" ADD CONSTRAINT "Situation_workStreamId_fkey" FOREIGN KEY ("workStreamId") REFERENCES "WorkStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
