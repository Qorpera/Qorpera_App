-- Invite: make entityId optional, add name + wikiPageSlug
ALTER TABLE "Invite" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "wikiPageSlug" TEXT;
DROP INDEX IF EXISTS "Invite_entityId_idx";

-- UserScope: make domainEntityId optional, add domainPageSlug
ALTER TABLE "UserScope" ALTER COLUMN "departmentEntityId" DROP NOT NULL;
ALTER TABLE "UserScope" ADD COLUMN IF NOT EXISTS "domainPageSlug" TEXT;

-- Replace entity-based unique with wiki-based unique
DROP INDEX IF EXISTS "UserScope_userId_departmentEntityId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserScope_userId_domainPageSlug_key"
  ON "UserScope" ("userId", "domainPageSlug");
