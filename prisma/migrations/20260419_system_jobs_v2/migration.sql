-- ── Drop legacy system-job tables ────────────────────────────────────────
-- Pre-pilot: accepting data loss on SystemJob/SystemJobRun
-- CASCADE handles any residual FK references from back-relations removed in the schema edit.
DROP TABLE IF EXISTS "SystemJobRun" CASCADE;
DROP TABLE IF EXISTS "SystemJob" CASCADE;

-- ── Create SystemJobIndex ─────────────────────────────────────────────────
CREATE TABLE "SystemJobIndex" (
  "id"                    TEXT NOT NULL,
  "wikiPageId"            TEXT NOT NULL,
  "operatorId"            TEXT NOT NULL,
  "slug"                  TEXT NOT NULL,
  "status"                TEXT NOT NULL,
  "triggerTypes"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cronExpression"        TEXT,
  "nextRunAt"             TIMESTAMP(3),
  "subscribedEvents"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "eventFilters"          JSONB,
  "creatorUserIdSnapshot" TEXT,
  "creatorRoleSnapshot"   TEXT,
  "deliverableKind"       TEXT NOT NULL DEFAULT 'proposals',
  "trustLevel"            TEXT NOT NULL DEFAULT 'propose',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemJobIndex_pkey" PRIMARY KEY ("id")
);

-- Unique: one index row per wiki page (hard invariant — materializer upserts on this)
CREATE UNIQUE INDEX "SystemJobIndex_wikiPageId_key"
  ON "SystemJobIndex"("wikiPageId");

-- Unique: guards against transient duplicate-slug rows if materializer ever mis-rebuilds
CREATE UNIQUE INDEX "SystemJobIndex_operatorId_slug_key"
  ON "SystemJobIndex"("operatorId", "slug");

-- Scheduler poll index — satisfies both (operatorId, status) and (operatorId, status, nextRunAt) queries
CREATE INDEX "SystemJobIndex_operatorId_status_nextRunAt_idx"
  ON "SystemJobIndex"("operatorId", "status", "nextRunAt");

-- Foreign keys (cascade: deleting the wiki page or operator nukes the index row)
ALTER TABLE "SystemJobIndex"
  ADD CONSTRAINT "SystemJobIndex_wikiPageId_fkey"
  FOREIGN KEY ("wikiPageId") REFERENCES "KnowledgePage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SystemJobIndex"
  ADD CONSTRAINT "SystemJobIndex_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "Operator"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
