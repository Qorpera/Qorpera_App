-- Workstream reassessment tracking

ALTER TABLE "WorkStream" ADD COLUMN "lastReassessmentAt" TIMESTAMP(3);
ALTER TABLE "WorkStream" ADD COLUMN "lastReassessmentResult" TEXT;
