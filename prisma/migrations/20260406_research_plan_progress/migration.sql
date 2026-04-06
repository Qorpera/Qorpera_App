-- Add progress tracking fields to ResearchPlan
ALTER TABLE "ResearchPlan" ADD COLUMN "progressMessage" TEXT;
ALTER TABLE "ResearchPlan" ADD COLUMN "completedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ResearchPlan" ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ResearchPlan" ADD COLUMN "totalWikiPages" INTEGER NOT NULL DEFAULT 0;
