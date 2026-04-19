-- Rename Initiative → Idea: table, constraints, indexes, FK columns, and stored string values.

-- 1. Table rename
ALTER TABLE "Initiative" RENAME TO "Idea";

-- 2. Primary key
ALTER INDEX "Initiative_pkey" RENAME TO "Idea_pkey";

-- 3. Indexes
ALTER INDEX "Initiative_operatorId_status_idx" RENAME TO "Idea_operatorId_status_idx";
ALTER INDEX "Initiative_projectId_key" RENAME TO "Idea_projectId_key";

-- 4. Foreign key constraints on the renamed table
ALTER TABLE "Idea" RENAME CONSTRAINT "Initiative_operatorId_fkey" TO "Idea_operatorId_fkey";
ALTER TABLE "Idea" RENAME CONSTRAINT "Initiative_projectId_fkey" TO "Idea_projectId_fkey";

-- 5. WikiBookmark FK column: resolvedInitiativeId → resolvedIdeaId
ALTER TABLE "WikiBookmark" RENAME COLUMN "resolvedInitiativeId" TO "resolvedIdeaId";
ALTER TABLE "WikiBookmark" RENAME CONSTRAINT "WikiBookmark_resolvedInitiativeId_fkey" TO "WikiBookmark_resolvedIdeaId_fkey";

-- 6. Migrate stored string literals so runtime comparisons keep working
UPDATE "NotificationPreference"
SET "notificationType" = REPLACE("notificationType", 'initiative_', 'idea_')
WHERE "notificationType" LIKE 'initiative_%';

UPDATE "WikiBookmark"
SET "resolvedAction" = 'idea_created'
WHERE "resolvedAction" = 'initiative_created';

UPDATE "EvaluationLog"
SET "classification" = 'idea_candidate'
WHERE "classification" = 'initiative_candidate';

-- KnowledgePage carries synthesisPath — covers "initiative_execution"
UPDATE "KnowledgePage"
SET "synthesisPath" = REPLACE("synthesisPath", 'initiative_', 'idea_')
WHERE "synthesisPath" LIKE 'initiative_%';
