-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "proposedProjectConfig" JSONB,
ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_projectId_key" ON "Initiative"("projectId");

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
