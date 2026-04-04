-- Add projectId to SourceConnector
ALTER TABLE "SourceConnector" ADD COLUMN "projectId" TEXT;
CREATE INDEX "SourceConnector_projectId_idx" ON "SourceConnector"("projectId");

-- ProjectTemplate
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "archetypeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "analysisFramework" JSONB NOT NULL,
    "dataExpectations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTemplate_operatorId_idx" ON "ProjectTemplate"("operatorId");
CREATE INDEX "ProjectTemplate_category_idx" ON "ProjectTemplate"("category");

-- Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_operatorId_status_idx" ON "Project"("operatorId", "status");
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- ProjectMember
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- ProjectDeliverable
CREATE TABLE "ProjectDeliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'intelligence',
    "generationMode" TEXT NOT NULL DEFAULT 'ai_generated',
    "content" JSONB,
    "completenessReport" JSONB,
    "confidenceLevel" TEXT,
    "riskCount" INTEGER NOT NULL DEFAULT 0,
    "templateSectionId" TEXT,
    "assignedToId" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDeliverable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectDeliverable_projectId_stage_idx" ON "ProjectDeliverable"("projectId", "stage");
CREATE INDEX "ProjectDeliverable_assignedToId_idx" ON "ProjectDeliverable"("assignedToId");

-- ProjectMessage
CREATE TABLE "ProjectMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "threadId" TEXT,
    "deliverableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectMessage_projectId_createdAt_idx" ON "ProjectMessage"("projectId", "createdAt" DESC);
CREATE INDEX "ProjectMessage_deliverableId_idx" ON "ProjectMessage"("deliverableId");

-- ProjectNotification
CREATE TABLE "ProjectNotification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectNotification_projectId_createdAt_idx" ON "ProjectNotification"("projectId", "createdAt" DESC);

-- ProjectChatMessage
CREATE TABLE "ProjectChatMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "apiCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectChatMessage_projectId_deliverableId_createdAt_idx" ON "ProjectChatMessage"("projectId", "deliverableId", "createdAt");

-- ProjectConnector
CREATE TABLE "ProjectConnector" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceConnectorId" TEXT,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "syncedItemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectConnector_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectConnector_projectId_idx" ON "ProjectConnector"("projectId");

-- Foreign keys
ALTER TABLE "SourceConnector" ADD CONSTRAINT "SourceConnector_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ProjectDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectNotification" ADD CONSTRAINT "ProjectNotification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ProjectDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectConnector" ADD CONSTRAINT "ProjectConnector_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectConnector" ADD CONSTRAINT "ProjectConnector_sourceConnectorId_fkey" FOREIGN KEY ("sourceConnectorId") REFERENCES "SourceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
