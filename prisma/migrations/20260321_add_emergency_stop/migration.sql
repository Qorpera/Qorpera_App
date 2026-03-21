-- Add emergency stop fields to Operator
ALTER TABLE "Operator" ADD COLUMN "aiPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Operator" ADD COLUMN "aiPausedAt" TIMESTAMP(3);
ALTER TABLE "Operator" ADD COLUMN "aiPausedById" TEXT;
ALTER TABLE "Operator" ADD COLUMN "aiPausedReason" TEXT;
