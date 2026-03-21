-- Day 13: Billing schema, API cost tracking, per-operator AppSettings

-- 1. BillingStatus enum
CREATE TYPE "BillingStatus" AS ENUM ('free', 'active', 'past_due', 'cancelled');

-- 2. Operator billing fields
ALTER TABLE "Operator"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "billingStatus" "BillingStatus" NOT NULL DEFAULT 'free',
  ADD COLUMN "billingStartedAt" TIMESTAMP(3),
  ADD COLUMN "orchestrationFeeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  ADD COLUMN "freeCopilotBudgetCents" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "freeCopilotUsedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "freeDetectionStartedAt" TIMESTAMP(3),
  ADD COLUMN "freeDetectionSituationCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Operator_stripeCustomerId_key" ON "Operator"("stripeCustomerId");

-- 3. Situation billing fields
ALTER TABLE "Situation"
  ADD COLUMN "apiCostCents" INTEGER,
  ADD COLUMN "billedCents" INTEGER,
  ADD COLUMN "billedAt" TIMESTAMP(3);

-- 4. ExecutionStep cost tracking
ALTER TABLE "ExecutionStep"
  ADD COLUMN "apiCostCents" INTEGER;

-- 5. CopilotMessage cost tracking
ALTER TABLE "CopilotMessage"
  ADD COLUMN "apiCostCents" INTEGER;

-- 6. AppSetting: migrate from key-only PK to id PK with optional operatorId
--    Step a: Add id column with defaults for existing rows
ALTER TABLE "AppSetting" ADD COLUMN "id" TEXT;
UPDATE "AppSetting" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "AppSetting" ALTER COLUMN "id" SET NOT NULL;

--    Step b: Drop old primary key on "key"
ALTER TABLE "AppSetting" DROP CONSTRAINT "AppSetting_pkey";

--    Step c: Add new id primary key
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id");

--    Step d: Add operatorId column (nullable — null means global)
ALTER TABLE "AppSetting" ADD COLUMN "operatorId" TEXT;

--    Step e: Add unique constraint on (key, operatorId)
CREATE UNIQUE INDEX "AppSetting_key_operatorId_key" ON "AppSetting"("key", "operatorId");

--    Step f: Add foreign key to Operator
ALTER TABLE "AppSetting"
  ADD CONSTRAINT "AppSetting_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "Operator"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

--    Step g: Partial unique index to prevent duplicate global keys (NULL operatorId)
CREATE UNIQUE INDEX "AppSetting_key_global_unique" ON "AppSetting"("key") WHERE "operatorId" IS NULL;
