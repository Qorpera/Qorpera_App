-- AlterTable: add budget management fields to Operator
ALTER TABLE "Operator" ADD COLUMN "monthlyBudgetCents" INTEGER;
ALTER TABLE "Operator" ADD COLUMN "budgetAlertThresholds" JSONB;
ALTER TABLE "Operator" ADD COLUMN "budgetHardStop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Operator" ADD COLUMN "budgetAlertsSentThisPeriod" JSONB;
ALTER TABLE "Operator" ADD COLUMN "budgetPeriodStart" TIMESTAMP(3);
