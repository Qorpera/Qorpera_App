-- Add adversarial challenge and gap analysis fields to ResearchPlan
ALTER TABLE "ResearchPlan" ADD COLUMN "adversarialReport" JSONB;
ALTER TABLE "ResearchPlan" ADD COLUMN "gapAnalysisReport" JSONB;
ALTER TABLE "ResearchPlan" ADD COLUMN "questionsForHuman" JSONB;
ALTER TABLE "ResearchPlan" ADD COLUMN "coverageScore" DOUBLE PRECISION;
