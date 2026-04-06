-- Replace index with unique constraint on AnalysisPromptVersion(promptType, version)
DROP INDEX IF EXISTS "AnalysisPromptVersion_promptType_version_idx";
CREATE UNIQUE INDEX "AnalysisPromptVersion_promptType_version_key" ON "AnalysisPromptVersion"("promptType", "version");
