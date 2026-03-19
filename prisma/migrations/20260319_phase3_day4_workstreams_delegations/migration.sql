-- Phase 3 Day 4: WorkStreamItem junction table + schema additions

-- WorkStreamItem (many-to-many junction table)
CREATE TABLE "WorkStreamItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workStreamId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkStreamItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkStreamItem_workStreamId_itemType_itemId_key"
  ON "WorkStreamItem"("workStreamId", "itemType", "itemId");

ALTER TABLE "WorkStreamItem"
  ADD CONSTRAINT "WorkStreamItem_workStreamId_fkey"
  FOREIGN KEY ("workStreamId") REFERENCES "WorkStream"("id") ON DELETE CASCADE;

-- Drop old FK columns from Situation and Initiative
ALTER TABLE "Situation" DROP CONSTRAINT IF EXISTS "Situation_workStreamId_fkey";
ALTER TABLE "Situation" DROP COLUMN IF EXISTS "workStreamId";

ALTER TABLE "Initiative" DROP CONSTRAINT IF EXISTS "Initiative_workStreamId_fkey";
ALTER TABLE "Initiative" DROP COLUMN IF EXISTS "workStreamId";
DROP INDEX IF EXISTS "Initiative_workStreamId_idx";

-- Peer AI notification source tracking
ALTER TABLE "Notification" ADD COLUMN "sourceAiEntityId" TEXT;

-- Delegation-sourced situations
ALTER TABLE "Situation" ADD COLUMN "delegationId" TEXT UNIQUE;
ALTER TABLE "Situation" ADD CONSTRAINT "Situation_delegationId_fkey"
  FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE SET NULL;
