-- Add restrictions column to ProjectMember for LLM-interpreted access restrictions
ALTER TABLE "ProjectMember" ADD COLUMN "restrictions" JSONB;
