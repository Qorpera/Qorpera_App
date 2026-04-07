-- Add isPortfolio flag to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isPortfolio" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark projects that have children as portfolios
UPDATE "Project" p SET "isPortfolio" = true
WHERE EXISTS (SELECT 1 FROM "Project" c WHERE c."parentProjectId" = p.id);
