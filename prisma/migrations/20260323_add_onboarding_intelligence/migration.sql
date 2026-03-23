-- Onboarding Intelligence: analysis tracking + agent run state

CREATE TABLE "OnboardingAnalysis" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentPhase" TEXT NOT NULL DEFAULT 'idle',
    "progressMessages" JSONB NOT NULL DEFAULT '[]',
    "synthesisOutput" JSONB,
    "uncertaintyLog" JSONB,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "totalCostCents" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingAgentRun" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "iterationCount" INTEGER NOT NULL DEFAULT 0,
    "maxIterations" INTEGER NOT NULL DEFAULT 30,
    "workingMemory" JSONB NOT NULL DEFAULT '{}',
    "followUpBrief" JSONB,
    "report" JSONB,
    "toolCallLog" JSONB NOT NULL DEFAULT '[]',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastIterationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingAgentRun_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "OnboardingAnalysis_operatorId_key" ON "OnboardingAnalysis"("operatorId");
CREATE INDEX "OnboardingAnalysis_status_idx" ON "OnboardingAnalysis"("status");

CREATE UNIQUE INDEX "OnboardingAgentRun_analysisId_agentName_round_key" ON "OnboardingAgentRun"("analysisId", "agentName", "round");
CREATE INDEX "OnboardingAgentRun_analysisId_status_idx" ON "OnboardingAgentRun"("analysisId", "status");

-- Foreign keys
ALTER TABLE "OnboardingAnalysis" ADD CONSTRAINT "OnboardingAnalysis_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnboardingAgentRun" ADD CONSTRAINT "OnboardingAgentRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "OnboardingAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
