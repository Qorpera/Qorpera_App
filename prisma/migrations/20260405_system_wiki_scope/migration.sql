-- Add scope column to KnowledgePage for operator vs system wiki
ALTER TABLE "KnowledgePage" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'operator';

-- Make operatorId nullable (system pages have no operator)
ALTER TABLE "KnowledgePage" ALTER COLUMN "operatorId" DROP NOT NULL;

-- Add intelligenceAccess to Operator (gates access to system wiki)
ALTER TABLE "Operator" ADD COLUMN "intelligenceAccess" BOOLEAN NOT NULL DEFAULT false;

-- Index for scope + pageType queries
CREATE INDEX "KnowledgePage_scope_pageType_idx" ON "KnowledgePage" ("scope", "pageType");

-- Partial unique index: system-scoped slugs must be unique
CREATE UNIQUE INDEX "KnowledgePage_system_slug_unique" ON "KnowledgePage" ("slug") WHERE "scope" = 'system';
