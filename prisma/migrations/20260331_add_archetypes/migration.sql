-- CreateTable
CREATE TABLE "SituationArchetype" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detectionTemplate" TEXT,
    "defaultSeverity" TEXT NOT NULL DEFAULT 'medium',
    "examplePhrases" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SituationArchetype_pkey" PRIMARY KEY ("slug")
);

-- AlterTable: SituationType
ALTER TABLE "SituationType" ADD COLUMN "archetypeSlug" TEXT;

-- AlterTable: EvaluationLog
ALTER TABLE "EvaluationLog" ADD COLUMN "archetypeSlug" TEXT;
ALTER TABLE "EvaluationLog" ADD COLUMN "archetypeConfidence" DOUBLE PRECISION;
