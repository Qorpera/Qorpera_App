-- Replace KnowledgePage embedding-based search with Postgres full-text search.
-- The tsvector column is STORED (auto-updates on title/slug/content change).

-- 1. Add tsvector generated column with weighted search:
--    title (A), slug (B), content (C)
ALTER TABLE "KnowledgePage" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', replace(coalesce(slug, ''), '-', ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) STORED;

-- 2. GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS knowledge_page_search_vector_idx
  ON "KnowledgePage" USING GIN ("searchVector");

-- 3. Composite index for common query pattern: operatorId + scope (excluding quarantined)
CREATE INDEX IF NOT EXISTS knowledge_page_operator_search_idx
  ON "KnowledgePage" ("operatorId", scope)
  WHERE status != 'quarantined';
