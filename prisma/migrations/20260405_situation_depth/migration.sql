-- Add investigation depth and analysis document to Situation
ALTER TABLE "Situation" ADD COLUMN "investigationDepth" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "Situation" ADD COLUMN "analysisDocument" JSONB;
