-- Add org-wide invite link token to Operator
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "inviteToken" TEXT;
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "inviteTokenCreatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Operator_inviteToken_key" ON "Operator"("inviteToken");
