-- Add wikiPageSlug to Situation model (links to situation_instance wiki page)
ALTER TABLE "Situation" ADD COLUMN "wikiPageSlug" TEXT;

-- Add structured properties and activity content to KnowledgePage
ALTER TABLE "KnowledgePage" ADD COLUMN "properties" JSONB;
ALTER TABLE "KnowledgePage" ADD COLUMN "activityContent" TEXT;
