-- AlterTable: SituationCycle — add updatedAt
ALTER TABLE "SituationCycle" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
