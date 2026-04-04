-- CreateTable
CREATE TABLE "ToolCallTrace" (
    "id" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "callIndex" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "resultSummary" TEXT,
    "resultTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCallTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolCallTrace_situationId_idx" ON "ToolCallTrace"("situationId");

-- CreateIndex
CREATE INDEX "ToolCallTrace_toolName_idx" ON "ToolCallTrace"("toolName");

-- AddForeignKey
ALTER TABLE "ToolCallTrace" ADD CONSTRAINT "ToolCallTrace_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
