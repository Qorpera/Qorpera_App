-- Additional partial indexes on KnowledgePage JSONB properties for situation_instance pages.
-- Complements indexes in 20260414_situation_wiki_jsonb_indexes (situation_id, status, severity).

-- Domain filtering (list route)
CREATE INDEX IF NOT EXISTS idx_kp_situation_domain
ON "KnowledgePage" ((properties->>'domain'))
WHERE "pageType" = 'situation_instance';

-- Detected_at sorting (status route, newest first)
CREATE INDEX IF NOT EXISTS idx_kp_situation_detected
ON "KnowledgePage" (((properties->>'detected_at')::timestamp) DESC)
WHERE "pageType" = 'situation_instance';
