-- Full-text search index on RawContent.rawBody for fast archive search
CREATE INDEX IF NOT EXISTS "RawContent_rawBody_fts_idx"
  ON "RawContent"
  USING GIN (to_tsvector('english', COALESCE("rawBody", '')));
