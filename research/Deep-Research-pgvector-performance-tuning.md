# pgvector Performance Optimization for Production RAG on Neon

**Researched:** 2026-03-20
**Prompt:** Research pgvector performance optimization for production RAG systems on Neon (serverless Postgres), covering HNSW vs IVFFlat, optimal index parameters, hybrid search, multi-tenant filtering, quantization, and Neon-specific guidance for a multi-tenant SaaS with 10K–100K content chunks per tenant at 1536-dimension embeddings.

## Key Findings

- **HNSW dominates IVFFlat**: 15.5x faster at 0.998 recall (40.5 QPS vs 2.6 QPS). IVFFlat requires reindexing after data distribution changes, making it unsuitable for continuously-ingesting systems.
- **pgvector 0.8.0 iterative scans solve the multi-tenant filtering problem**: Pre-0.8.0, HNSW with WHERE clauses could return too few results. Iterative scans expand the graph search until enough filtered matches are found — critical for `operatorId`-scoped queries.
- **halfvec delivers 50% storage/index savings with >99% recall retention**: Converting 32-bit float vectors to 16-bit half-precision is the highest ROI optimization at this scale.
- **Hybrid search (vector + full-text with RRF) improves retrieval precision from ~62% to ~84%**: A ~22 percentage point improvement by combining semantic similarity with keyword matching.
- **Default index parameters leave performance on the table**: Increasing `ef_construction` from 64 to 128 and `ef_search` from 40 to 100 provides meaningfully better recall with acceptable latency tradeoffs at the 10K–100K scale.

## Full Research

### 1. HNSW vs IVFFlat Index Comparison

**Recommendation: HNSW for all production workloads at this scale.**

| Factor | HNSW | IVFFlat |
|---|---|---|
| Query speed | 15.5x faster at 0.998 recall (40.5 QPS vs 2.6 QPS) | Slower, linear scaling with probes |
| Build time | 12–42x slower than IVFFlat | Fast builds |
| Index size | Larger (more graph connections) | Smaller |
| Recall scaling | Logarithmic (scales well) | Linear (degrades at scale) |
| Data requirement | Can be built on empty table, updates incrementally | Needs representative data; must REINDEX after significant data changes |
| Concurrent writes | Handles well (no reindex needed) | Needs periodic reindexing as data distribution shifts |

#### By Data Scale

| Scale | Recommendation | Why |
|---|---|---|
| <10K vectors | No index (sequential scan) | ~36ms sequential scan is fast enough; index overhead not justified |
| 10K–50K | HNSW or sequential scan | Sequential scans become costly around 50K; HNSW gives sub-10ms queries |
| 50K–1M | HNSW | Clear winner for speed-recall tradeoff |
| 1M+ | HNSW (with quantization) | Still best; consider halfvec or binary quantization for index memory |

For per-operator data (10K–100K chunks), this falls in the sweet spot for HNSW. The total table (all operators combined) could reach millions of rows, making the HNSW index essential.

---

### 2. Optimal Index Parameters

#### HNSW Parameters

| Parameter | Default | Recommended | Impact |
|---|---|---|---|
| `m` | 16 | **16** (keep) | Max connections per node. Range 5–48. Higher = better recall, larger index. 16 is the sweet spot for 1536-dim vectors at this scale. |
| `ef_construction` | 64 | **128** (increase) | Graph quality during build. Must be >= 2×m. Higher = better graph, slower build. At this scale, 128 gives meaningfully better recall with acceptable build time. |
| `ef_search` | 40 | **100** (increase at runtime) | Candidates explored per query. Higher = better recall, slower query. For RAG, high recall is essential. Set via `SET hnsw.ef_search = 100;` or `ALTER DATABASE`. |

Recommended index creation SQL:

```sql
CREATE INDEX content_chunk_embedding_idx ON "ContentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128)
WHERE embedding IS NOT NULL;
```

Set ef_search at the database level (persists across pooled connections):

```sql
ALTER DATABASE neondb SET hnsw.ef_search = 100;
```

**Tuning strategy**: Start with `ef_search = ef_construction`, measure recall against a ground-truth set (run exact search on a sample), then adjust. If recall < 0.95, increase ef_search. If query latency is acceptable, keep raising until target recall is achieved.

#### IVFFlat Parameters (for reference)

| Parameter | Formula | Example (100K rows) |
|---|---|---|
| `lists` | rows / 1000 (up to 1M) or sqrt(rows) (>1M) | 100 lists |
| `probes` | lists / 10 (up to 1M) or sqrt(lists) (>1M) | 10 probes |

IVFFlat is not recommended for continuously-ingesting systems because it requires reindexing after significant data changes.

---

### 3. Exact vs Approximate Search

| Approach | When to Use | Expected Latency |
|---|---|---|
| Exact (sequential scan) | <10K rows matching WHERE filter, 100% recall needed, or one-off admin queries | ~36ms at 10K rows, ~500ms+ at 100K |
| Approximate (HNSW) | >10K rows, production queries, RAG retrieval | <10ms typically |

For multi-tenant models where each operator has 10K–100K chunks, when filtering `WHERE "operatorId" = $1`, the effective dataset per query is the per-tenant size. At 10K per tenant, sequential scan is borderline acceptable (~36ms). At 50K+ per tenant, the HNSW index is necessary.

With pgvector 0.8.0's iterative scan feature, the HNSW index works reliably with WHERE filters, providing fast approximate search with correct filtering.

Forcing exact search when needed:

```sql
SET enable_indexscan = off;
SET enable_bitmapscan = off;
-- Run exact query
SET enable_indexscan = on;
SET enable_bitmapscan = on;
```

---

### 4. Hybrid Search: Combining Full-Text and Vector Search

Pure vector search achieves ~62% retrieval precision. Adding full-text search with Reciprocal Rank Fusion (RRF) brings this to ~84% — an improvement of ~22 percentage points.

#### Implementation

**Step 1: Add a tsvector column**

```sql
ALTER TABLE "ContentChunk" ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX content_chunk_tsv_idx ON "ContentChunk" USING gin(tsv);
```

**Step 2: Hybrid search query with RRF**

```sql
WITH semantic AS (
  SELECT id, content, "sourceType", "sourceId", "entityId",
         ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank_ix
  FROM "ContentChunk"
  WHERE "operatorId" = $2
    AND embedding IS NOT NULL
  ORDER BY embedding <=> $1::vector
  LIMIT 20  -- over-fetch for better fusion
),
fulltext AS (
  SELECT id, content, "sourceType", "sourceId", "entityId",
         ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, websearch_to_tsquery('english', $3)) DESC) AS rank_ix
  FROM "ContentChunk"
  WHERE "operatorId" = $2
    AND tsv @@ websearch_to_tsquery('english', $3)
  ORDER BY ts_rank_cd(tsv, websearch_to_tsquery('english', $3)) DESC
  LIMIT 20  -- over-fetch
)
SELECT
  COALESCE(s.id, f.id) AS id,
  COALESCE(s.content, f.content) AS content,
  COALESCE(s.rank_ix, 1000) AS semantic_rank,
  COALESCE(f.rank_ix, 1000) AS fulltext_rank,
  -- RRF score: k=60 is the standard default
  COALESCE(1.0 / (60 + s.rank_ix), 0.0) +
  COALESCE(1.0 / (60 + f.rank_ix), 0.0) AS rrf_score
FROM semantic s
FULL OUTER JOIN fulltext f ON s.id = f.id
ORDER BY rrf_score DESC
LIMIT 10;
```

Key points:
- Over-fetch (20 from each source) then trim to 10 — consistently outperforms fetching only 10
- RRF k=60 is a reasonable default; test values 10–100 for specific data
- Hybrid search is most beneficial for queries mixing exact keywords with semantic intent (e.g., "Q4 revenue report from Acme" — "Acme" benefits from exact match, "revenue report" from semantic)

---

### 5. Performance Benchmarks on Neon

Neon has not published detailed pgvector-specific benchmark reports with raw QPS numbers. Known data points:

| Metric | Value | Source |
|---|---|---|
| Sequential scan, 10K rows | ~36ms | Neon docs |
| Sequential scan, 50K rows | >100ms (becomes costly) | Neon docs |
| Cold start (compute wake) | ~0.5 seconds | Neon architecture |
| Cold start with connection pooling | Masked by PgBouncer warm connections | Neon docs |
| Sub-100ms queries | Achievable for <10M vectors with HNSW | General pgvector benchmarks |
| HNSW index build (pgvector 0.7+) | Up to 30x faster with parallel workers | Neon blog |

Neon-specific performance notes:
- Neon's storage/compute separation means the HNSW index must be loaded from storage into compute memory on cold start. For hot computes, performance matches traditional Postgres.
- Read replicas can offload vector search from the primary, useful for RAG-heavy workloads.
- Neon's autoscaling can temporarily scale up compute for index builds, then scale back down.

---

### 6. Connection Pooling Considerations

Neon uses PgBouncer in **transaction mode** (`pool_mode=transaction`), supporting up to 10,000 concurrent connections.

| Consideration | Impact | Mitigation |
|---|---|---|
| SET statements not persistent | `SET hnsw.ef_search = 100` resets after each transaction | Use `SET LOCAL` within a transaction, or set at database level with `ALTER DATABASE` |
| No prepared statements | PgBouncer transaction mode does not support prepared statements | Use `$queryRawUnsafe` instead of prepared statement protocols |
| Session state lost | Variables set via SET not preserved across requests | Use database-level defaults or wrap in explicit transactions |

Recommended approach:

```sql
-- Set ef_search as a database-level default (persists across all connections)
ALTER DATABASE neondb SET hnsw.ef_search = 100;

-- Or, for per-query control, wrap in a transaction:
BEGIN;
SET LOCAL hnsw.ef_search = 200;
SELECT ... ORDER BY embedding <=> $1::vector LIMIT 10;
COMMIT;
```

Always use the pooled connection string (`-pooler` endpoint) for application queries. Use the direct (non-pooled) connection for migrations and index builds.

---

### 7. Common Pitfalls

#### 7.1 maintenance_work_mem Too Low

Default is 64MB. HNSW index build spills to disk, running 10–50x slower.

For 500K total chunks at 1536 dims, each vector is ~6KB, totaling ~3GB of vector data. Set `maintenance_work_mem` to at least 1–2GB for index builds:

```sql
-- Before index build (use direct connection, not pooled)
SET maintenance_work_mem = '2GB';
SET max_parallel_maintenance_workers = 4;
CREATE INDEX CONCURRENTLY ...;
```

#### 7.2 Prisma Cannot Deserialize pgvector Columns

Including the embedding column in a Prisma result causes deserialization errors. Use `select: { id: true }` on `ContentChunk.create()` and raw SQL for vector queries.

#### 7.3 Not Using CONCURRENTLY for Index Builds

`CREATE INDEX` locks the table for writes during build. Always use `CREATE INDEX CONCURRENTLY` in production to allow concurrent writes (takes longer but avoids blocking).

#### 7.4 Forgetting to VACUUM After Bulk Deletes

Content pipelines that delete old chunks before re-indexing accumulate dead tuples that degrade HNSW scan performance. Monitor autovacuum:

```sql
SELECT relname, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'ContentChunk';
```

#### 7.5 Memory Leak During VACUUM of Large HNSW Indexes

Known pgvector issue — vacuuming large HNSW graphs with many deletions can cause OOM in memory-constrained environments. Monitor memory during vacuum. On Neon, autoscaling helps mitigate this.

#### 7.6 Returning Too Few Results with WHERE Filters (Pre-0.8.0)

With HNSW and default `ef_search=40`, if a WHERE filter matches only 10% of rows, approximately 4 results are returned instead of the requested LIMIT. Upgrade to pgvector 0.8.0+ and enable iterative scans.

#### 7.7 Embedding NULLs in the Index

If the HNSW index includes all rows, rows with NULL embeddings waste index space. Use a partial index:

```sql
CREATE INDEX content_chunk_embedding_idx ON "ContentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128)
WHERE embedding IS NOT NULL;
```

---

### 8. Neon-Specific Guidance

#### 8.1 Compute Sizing for pgvector

| Neon CU | vCPUs | RAM | Suitable For |
|---|---|---|---|
| 0.25 CU | 0.25 | 1GB | Dev/test only |
| 1 CU | 1 | 4GB | <100K vectors, light queries |
| 2 CU | 2 | 8GB | 100K–500K vectors, moderate RAG |
| 4 CU | 4 | 16GB | 500K–2M vectors, heavy RAG |
| 7 CU | 7 | 28GB | 2M+ vectors, index builds |

#### 8.2 Autoscaling Strategy

- **Min CU**: Set to handle steady-state query load (1–2 CU for 10K–100K per-tenant scale)
- **Max CU**: Set higher to absorb index builds and bulk ingestion spikes (4+ CU)
- HNSW index builds temporarily need high memory; autoscaling handles this without permanent overprovisioning

#### 8.3 Read Replicas for RAG

Vector similarity search is read-only. Offload RAG queries to a read replica:
- **Primary**: handles connector sync writes, content ingestion
- **Read replica**: handles copilot queries, context assembly, reasoning context retrieval

#### 8.4 Disk Swap for Index Builds

Neon uses a disk swap technique — even with 1GB RAM, `SET maintenance_work_mem = '8GB'` is possible and Neon will use disk-backed memory. Slower than pure RAM but prevents build failures. For production index builds, temporarily scale up compute instead.

#### 8.5 pgvector Version on Neon

Neon supports pgvector 0.8.0+ (as of late 2025). Check version:

```sql
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

Upgrading unlocks iterative scans, critical for multi-tenant WHERE-filtered queries.

---

### 9. Multi-Tenant Considerations

#### 9.1 The Core Problem

HNSW indexes search the entire graph, then apply WHERE filters *after*. If operator A has 10K chunks out of 500K total, the index scans many irrelevant vectors before filtering.

#### 9.2 Solution Options (Ranked)

**Option A: Iterative Scans (pgvector 0.8.0+) — Recommended**

The best approach for 10–50 operators at 10K–100K chunks each.

```sql
-- Enable iterative scan (set at database level)
ALTER DATABASE neondb SET hnsw.iterative_scan = 'relaxed_order';

-- Optionally increase the max scan tuples (default 20,000)
ALTER DATABASE neondb SET hnsw.max_scan_tuples = 40000;
```

How it works: Instead of scanning a fixed number of candidates and filtering, pgvector 0.8.0 iteratively expands its search through the HNSW graph until it finds enough results matching the WHERE clause, up to `max_scan_tuples`.

Existing queries automatically benefit:

```sql
SELECT ... FROM "ContentChunk"
WHERE "operatorId" = $2 AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $3
```

The planner uses the HNSW index and iteratively scans until enough rows matching `operatorId = $2` are found.

**Option B: Table Partitioning by operatorId**

For larger scale (1M+ total chunks, many operators):

```sql
-- Convert to partitioned table
CREATE TABLE "ContentChunk_partitioned" (LIKE "ContentChunk" INCLUDING ALL)
PARTITION BY LIST ("operatorId");

-- Create a partition per operator
CREATE TABLE "ContentChunk_op1" PARTITION OF "ContentChunk_partitioned"
FOR VALUES IN ('clxx_operator1');

-- Each partition gets its own HNSW index automatically
CREATE INDEX ON "ContentChunk_op1" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);
```

Benefits: Query planner prunes partitions at plan time — each operator's query only touches their own HNSW index. Per-tenant exact search becomes feasible (10K rows per partition).

Drawbacks: Operational complexity (partition management as operators are added/removed), Prisma does not natively manage partitioned tables.

**Option C: Partial Indexes per Operator**

```sql
CREATE INDEX content_chunk_emb_op1_idx ON "ContentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128)
WHERE "operatorId" = 'clxx_operator1';
```

Works but does not scale — requires one index per operator, and the planner must match the WHERE clause form exactly.

#### 9.3 Supporting B-tree Index

Regardless of approach, ensure a B-tree index on operatorId exists:

```sql
CREATE INDEX IF NOT EXISTS content_chunk_operator_idx ON "ContentChunk" ("operatorId");
```

#### 9.4 Scale Thresholds

At 10–50 operators, 10K–100K chunks each, 500K–5M total:
1. Upgrade to pgvector 0.8.0+ if not already there
2. Enable iterative scans (`relaxed_order` mode)
3. Add standalone operatorId B-tree index if not already present
4. Keep the single HNSW index on the whole table
5. Revisit partitioning if/when total chunks exceed 5M or operator count exceeds 100

---

### 10. Quantization and Dimensionality Reduction

#### 10.1 halfvec (Scalar Quantization) — Recommended

Converts 32-bit floats to 16-bit half-precision.

| Metric | vector(1536) | halfvec(1536) | Savings |
|---|---|---|---|
| Bytes per vector | 6,148 | 3,076 | 50% |
| Index size | Baseline | ~50% smaller | 50% |
| Index build time | Baseline | ~2x faster | 50% |
| Recall (cosine) | Baseline | >99% | Negligible loss |

Migration path:

```sql
-- Step 1: Add halfvec column
ALTER TABLE "ContentChunk" ADD COLUMN embedding_half halfvec(1536);

-- Step 2: Populate from existing embeddings
UPDATE "ContentChunk" SET embedding_half = embedding::halfvec(1536)
WHERE embedding IS NOT NULL;

-- Step 3: Create HNSW index on halfvec
CREATE INDEX content_chunk_embedding_half_idx ON "ContentChunk"
USING hnsw (embedding_half halfvec_cosine_ops)
WITH (m = 16, ef_construction = 128)
WHERE embedding_half IS NOT NULL;

-- Step 4: Update retriever queries
-- Change: embedding <=> $1::vector
-- To:     embedding_half <=> $1::halfvec
```

The full-precision `embedding` column can be kept for re-ranking if needed, but at this scale halfvec alone provides >99% recall.

#### 10.2 Binary Quantization

Reduces each dimension to 1 bit (32x compression). A 1536-dim vector becomes just 192 bytes.

| Metric | Value |
|---|---|
| Storage reduction | 32x |
| Index build speedup | ~67x (combined with parallel workers) |
| Recall | Significant degradation without re-ranking |

Best used for two-phase retrieval — binary index for fast candidate generation, re-rank with full vectors:

```sql
-- Create bit column and index
ALTER TABLE "ContentChunk" ADD COLUMN embedding_bit bit(1536);
UPDATE "ContentChunk" SET embedding_bit = binary_quantize(embedding)::bit(1536);

CREATE INDEX content_chunk_bit_idx ON "ContentChunk"
USING hnsw (embedding_bit bit_hamming_ops);

-- Two-phase query: fast candidate set, then re-rank
WITH candidates AS (
  SELECT id, embedding
  FROM "ContentChunk"
  WHERE "operatorId" = $2
  ORDER BY embedding_bit <~> binary_quantize($1::vector)::bit(1536)
  LIMIT 100  -- broad candidate set
)
SELECT id, 1 - (embedding <=> $1::vector) AS score
FROM candidates
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

Not recommended until scale exceeds what halfvec handles comfortably — at 10K–100K chunks per tenant, halfvec provides sufficient performance without the recall penalty.

#### 10.3 Matryoshka Embeddings (Dimensionality Reduction)

OpenAI's text-embedding-3-small supports Matryoshka representation learning — embeddings can be truncated to fewer dimensions.

| Dimensions | Size (vector) | Size (halfvec) | Recall vs 1536 |
|---|---|---|---|
| 1536 (full) | 6,148 bytes | 3,076 bytes | 100% |
| 512 | 2,052 bytes | 1,028 bytes | ~95–98% |
| 256 | 1,028 bytes | 516 bytes | ~90–95% |

To use 512 dimensions (request from OpenAI API):

```typescript
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: text,
  dimensions: 512,  // Matryoshka truncation
});
```

Trade-off: 3x less storage and faster search, but some semantic fidelity loss. For RAG in a business context, 512 dimensions may lose nuance in domain-specific content. Benchmark on actual data before committing.

#### 10.4 Combined Strategy (Future Optimization)

The most aggressive optimization combines multiple techniques:

```
text-embedding-3-small @ 512 dims → halfvec(512) → HNSW index
```

Result: 1,028 bytes per vector (6x reduction from current), faster index builds, smaller memory footprint, with ~95% recall. Worth testing when total chunks exceed 1M.

---

### Prioritized Action Plan

| Priority | Action | Effort |
|---|---|---|
| Immediate | `ALTER DATABASE SET hnsw.ef_search = 100` | 1 min |
| Immediate | Check pgvector version, enable iterative scans | 5 min |
| Short-term | Rebuild index with `ef_construction=128` + partial index | Migration |
| Short-term | Migrate to halfvec for 50% savings | Migration |
| Short-term | Add standalone operatorId index on ContentChunk | Migration |
| Medium-term | Implement hybrid search (tsvector + RRF) | Feature work |
| Medium-term | Add read replica for RAG offloading | Infra |
| At scale | Table partitioning by operatorId (>5M chunks) | Major migration |
| At scale | Evaluate 512-dim Matryoshka embeddings | Testing + migration |

## Sources

- [Neon: pgvector Extension Docs](https://neon.com/docs/extensions/pgvector)
- [Neon: Optimize pgvector Search](https://neon.com/docs/ai/ai-vector-search-optimization)
- [Neon: Optimizing Vector Search Performance with pgvector](https://neon.com/blog/optimizing-vector-search-performance-with-pgvector)
- [Neon: pgvector 30x Faster Index Build](https://neon.com/blog/pgvector-30x-faster-index-build-for-your-vector-embeddings)
- [Neon: Don't Use vector, Use halfvec Instead](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost)
- [Neon: RAG With Autoscaling](https://neon.com/blog/rag-with-autoscaling)
- [Neon: Understanding Vector Search and HNSW Index](https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector)
- [Neon: Scale Your AI Application](https://neon.com/docs/ai/ai-scale-with-neon)
- [Neon: Connection Pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon: Benchmarking Latency](https://neon.com/docs/guides/benchmarking-latency)
- [pgvector GitHub Repository](https://github.com/pgvector/pgvector)
- [pgvector 0.8.0 Release Announcement](https://www.postgresql.org/about/news/pgvector-080-released-2952/)
- [AWS: pgvector 0.8.0 Iterative Index Scans](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/)
- [AWS: HNSW vs IVFFlat Deep Dive](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [AWS: 67x Faster Embeddings with pgvector](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/)
- [Crunchy Data: HNSW Indexes with pgvector](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [Crunchy Data: pgvector Performance Tips](https://www.crunchydata.com/blog/pgvector-performance-for-developers)
- [Crunchy Data: Scaling Vector Data with Postgres](https://www.crunchydata.com/blog/scaling-vector-data-with-postgres)
- [Jonathan Katz: 150x pgvector Speedup](https://jkatz05.com/post/postgres/pgvector-performance-150x-speedup/)
- [Jonathan Katz: Scalar and Binary Quantization](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)
- [Jonathan Katz: Hybrid Search with pgvector](https://jkatz05.com/post/postgres/hybrid-search-postgres-pgvector/)
- [Google Cloud: Faster Similarity Search with pgvector](https://cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes)
- [ParadeDB: Hybrid Search in PostgreSQL](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
- [Supabase: Matryoshka Embeddings](https://supabase.com/blog/matryoshka-embeddings)
- [Nile: Multi-Tenant RAG Applications](https://www.thenile.dev/blog/multi-tenant-rag)
- [Nile: pgvector 0.8.0 on Nile](https://www.thenile.dev/blog/pgvector-080)
- [DEV: Hybrid Search with RRF](https://dev.to/lpossamai/building-hybrid-search-for-rag-combining-pgvector-and-full-text-search-with-reciprocal-rank-fusion-6nk)
- [DEV: Scaling pgvector Memory and Quantization](https://dev.to/philip_mcclarence_2ef9475/scaling-pgvector-memory-quantization-and-index-build-strategies-8m2)
- [Microsoft: pgvector Performance Optimization](https://learn.microsoft.com/en-us/azure/cosmos-db/postgresql/howto-optimize-performance-pgvector)
- [Clarvo: Filtered Vector Queries from Seconds to Milliseconds](https://www.clarvo.ai/blog/optimizing-filtered-vector-queries-from-tens-of-seconds-to-single-digit-milliseconds-in-postgresql)
