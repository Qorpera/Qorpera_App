-- AlterTable: Add ownerUserId to Entity
ALTER TABLE "Entity" ADD COLUMN "ownerUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Entity_ownerUserId_key" ON "Entity"("ownerUserId");

-- CreateIndex
CREATE INDEX "Entity_ownerUserId_idx" ON "Entity"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PersonalAutonomy" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "situationTypeId" TEXT NOT NULL,
    "aiEntityId" TEXT NOT NULL,
    "autonomyLevel" TEXT NOT NULL DEFAULT 'supervised',
    "consecutiveApprovals" INTEGER NOT NULL DEFAULT 0,
    "totalProposed" INTEGER NOT NULL DEFAULT 0,
    "totalApproved" INTEGER NOT NULL DEFAULT 0,
    "approvalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalAutonomy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAutonomy_situationTypeId_aiEntityId_key" ON "PersonalAutonomy"("situationTypeId", "aiEntityId");

-- CreateIndex
CREATE INDEX "PersonalAutonomy_operatorId_idx" ON "PersonalAutonomy"("operatorId");

-- CreateIndex
CREATE INDEX "PersonalAutonomy_aiEntityId_idx" ON "PersonalAutonomy"("aiEntityId");

-- AddForeignKey
ALTER TABLE "PersonalAutonomy" ADD CONSTRAINT "PersonalAutonomy_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAutonomy" ADD CONSTRAINT "PersonalAutonomy_situationTypeId_fkey" FOREIGN KEY ("situationTypeId") REFERENCES "SituationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAutonomy" ADD CONSTRAINT "PersonalAutonomy_aiEntityId_fkey" FOREIGN KEY ("aiEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
