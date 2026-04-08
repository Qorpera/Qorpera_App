-- CreateTable
CREATE TABLE "SystemIntelligenceSignal" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "systemPageSlug" TEXT,
    "systemPageTitle" TEXT,
    "situationTypeSlug" TEXT,
    "industryVertical" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "curatorAction" TEXT,

    CONSTRAINT "SystemIntelligenceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemIntelligenceLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "pageSlug" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "pageType" TEXT,
    "previousContent" TEXT,
    "newContent" TEXT,
    "reason" TEXT NOT NULL,
    "changeSource" TEXT NOT NULL,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "signalSummary" JSONB,
    "operatorCount" INTEGER NOT NULL DEFAULT 0,
    "curatorModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SystemIntelligenceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemIntelligenceSignal_signalType_idx" ON "SystemIntelligenceSignal"("signalType");

-- CreateIndex
CREATE INDEX "SystemIntelligenceSignal_systemPageSlug_idx" ON "SystemIntelligenceSignal"("systemPageSlug");

-- CreateIndex
CREATE INDEX "SystemIntelligenceSignal_operatorId_idx" ON "SystemIntelligenceSignal"("operatorId");

-- CreateIndex
CREATE INDEX "SystemIntelligenceSignal_createdAt_idx" ON "SystemIntelligenceSignal"("createdAt");

-- CreateIndex
CREATE INDEX "SystemIntelligenceSignal_processedAt_idx" ON "SystemIntelligenceSignal"("processedAt");

-- CreateIndex
CREATE INDEX "SystemIntelligenceLog_pageSlug_idx" ON "SystemIntelligenceLog"("pageSlug");

-- CreateIndex
CREATE INDEX "SystemIntelligenceLog_action_idx" ON "SystemIntelligenceLog"("action");

-- CreateIndex
CREATE INDEX "SystemIntelligenceLog_createdAt_idx" ON "SystemIntelligenceLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SystemIntelligenceSignal" ADD CONSTRAINT "SystemIntelligenceSignal_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
