-- AlterTable: Add userId to ContentChunk for per-person content privacy
ALTER TABLE "ContentChunk" ADD COLUMN "userId" TEXT;

-- CreateIndex: composite index for operatorId + userId queries
CREATE INDEX "ContentChunk_operatorId_userId_idx" ON "ContentChunk"("operatorId", "userId");

-- AddForeignKey: ContentChunk.userId → User.id
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add deletion/suspension fields to User
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "accountSuspended" BOOLEAN NOT NULL DEFAULT false;
