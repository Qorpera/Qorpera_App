-- Partial indexes on KnowledgePage JSONB properties for situation_instance pages.
-- These accelerate wiki-first situation lookups without modifying the Prisma schema.

-- Fast lookup by situation_id (maps wiki page ↔ thin Situation record)
CREATE INDEX IF NOT EXISTS idx_kp_situation_id
ON "KnowledgePage" ((properties->>'situation_id'))
WHERE "pageType" = 'situation_instance';

-- Fast filtering by status (list routes filter by open/resolved)
CREATE INDEX IF NOT EXISTS idx_kp_situation_status
ON "KnowledgePage" ((properties->>'status'))
WHERE "pageType" = 'situation_instance';

-- Fast ordering by severity (descending — highest severity first)
CREATE INDEX IF NOT EXISTS idx_kp_situation_severity
ON "KnowledgePage" (((properties->>'severity')::float) DESC)
WHERE "pageType" = 'situation_instance';
