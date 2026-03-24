-- CreateTable
CREATE TABLE "DepartmentHealth" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "departmentEntityId" TEXT,
    "snapshot" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentHealth_operatorId_idx" ON "DepartmentHealth"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentHealth_operatorId_departmentEntityId_key" ON "DepartmentHealth"("operatorId", "departmentEntityId");

-- Partial unique index for operator-level aggregate rows (departmentEntityId IS NULL)
-- Needed for INSERT ... ON CONFLICT since @@unique doesn't enforce on NULLs
CREATE UNIQUE INDEX "DepartmentHealth_operatorId_null_dept_key" ON "DepartmentHealth"("operatorId") WHERE "departmentEntityId" IS NULL;

-- AddForeignKey
ALTER TABLE "DepartmentHealth" ADD CONSTRAINT "DepartmentHealth_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
