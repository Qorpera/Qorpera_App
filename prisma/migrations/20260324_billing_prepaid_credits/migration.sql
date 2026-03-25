-- AlterEnum: add 'depleted' to BillingStatus
ALTER TYPE "BillingStatus" ADD VALUE 'depleted';

-- AlterTable: Operator — add prepaid credit fields
ALTER TABLE "Operator" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Operator" ADD COLUMN "autoReloadEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Operator" ADD COLUMN "autoReloadThresholdCents" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "Operator" ADD COLUMN "autoReloadAmountCents" INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE "Operator" ADD COLUMN "stripePaymentMethodId" TEXT;

-- AlterTable: Operator — remove subscription field
ALTER TABLE "Operator" DROP COLUMN IF EXISTS "stripeSubscriptionId";

-- CreateTable: CreditTransaction
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "stripePaymentIntentId" TEXT,
    "situationId" TEXT,
    "copilotMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTransaction_operatorId_createdAt_idx" ON "CreditTransaction"("operatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
