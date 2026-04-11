-- Wiki-first entity migration: add pageSlug references, map position, and RawContent processing fields

-- Task 1A: Add pageSlug references to models that currently use entityId

-- Situation
ALTER TABLE "Situation" ADD COLUMN "assignedPageSlug" TEXT;
ALTER TABLE "Situation" ADD COLUMN "ownerPageSlug" TEXT;
ALTER TABLE "Situation" ADD COLUMN "domainPageSlug" TEXT;
ALTER TABLE "Situation" ADD COLUMN "situationTypeSlug" TEXT;

-- Initiative
ALTER TABLE "Initiative" ADD COLUMN "ownerPageSlug" TEXT;
ALTER TABLE "Initiative" ADD COLUMN "domainPageSlug" TEXT;

-- RecurringTask
ALTER TABLE "RecurringTask" ADD COLUMN "ownerPageSlug" TEXT;
ALTER TABLE "RecurringTask" ADD COLUMN "domainPageSlug" TEXT;

-- SystemJob
ALTER TABLE "SystemJob" ADD COLUMN "targetPageSlug" TEXT;

-- SituationType
ALTER TABLE "SituationType" ADD COLUMN "wikiPageSlug" TEXT;

-- User
ALTER TABLE "User" ADD COLUMN "wikiPageSlug" TEXT;

-- Task 1B: Add map position to KnowledgePage
ALTER TABLE "KnowledgePage" ADD COLUMN "mapX" DOUBLE PRECISION;
ALTER TABLE "KnowledgePage" ADD COLUMN "mapY" DOUBLE PRECISION;

-- Task 1C: Add processedAt/processedBy to RawContent
ALTER TABLE "RawContent" ADD COLUMN "processedAt" TIMESTAMP(3);
ALTER TABLE "RawContent" ADD COLUMN "processedBy" TEXT;
