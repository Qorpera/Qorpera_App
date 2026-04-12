-- Make Initiative.aiEntityId nullable (deprecated — use ownerPageSlug instead)
ALTER TABLE "Initiative" ALTER COLUMN "aiEntityId" DROP NOT NULL;
