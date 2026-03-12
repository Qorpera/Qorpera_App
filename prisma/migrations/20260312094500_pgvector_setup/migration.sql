-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Convert ContentChunk.embedding from text to native vector(1536)
ALTER TABLE "ContentChunk" ALTER COLUMN "embedding" TYPE vector(1536) USING embedding::vector(1536);

-- HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS content_chunk_embedding_idx ON "ContentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add entity embedding column for identity resolution (Day 28)
ALTER TABLE "Entity" ADD COLUMN IF NOT EXISTS "entityEmbedding" vector(1536);

CREATE INDEX IF NOT EXISTS entity_embedding_idx ON "Entity"
USING hnsw ("entityEmbedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
