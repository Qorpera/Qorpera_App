CREATE TABLE "WorkerJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkerJob_status_createdAt_idx" ON "WorkerJob"("status", "createdAt");
