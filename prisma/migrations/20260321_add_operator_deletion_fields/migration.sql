-- AlterTable: Add GDPR deletion lifecycle fields to Operator
ALTER TABLE "Operator" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Operator" ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);
