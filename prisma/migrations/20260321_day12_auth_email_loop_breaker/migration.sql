-- Day 12: Auth hardening, email delivery, loop breaker

-- PasswordResetToken model
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User fields
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastDigestSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Situation LLM tracking fields
ALTER TABLE "Situation" ADD COLUMN "modelId" TEXT;
ALTER TABLE "Situation" ADD COLUMN "promptVersion" INTEGER;
ALTER TABLE "Situation" ADD COLUMN "reasoningDurationMs" INTEGER;

-- ExecutionPlan LLM tracking + loop breaker fields
ALTER TABLE "ExecutionPlan" ADD COLUMN "modelId" TEXT;
ALTER TABLE "ExecutionPlan" ADD COLUMN "promptVersion" INTEGER;
ALTER TABLE "ExecutionPlan" ADD COLUMN "totalStepExecutions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExecutionPlan" ADD COLUMN "maxStepExecutions" INTEGER NOT NULL DEFAULT 15;
