-- Add parameters JSON field to ExecutionStep for action preview UI
ALTER TABLE "ExecutionStep" ADD COLUMN "parameters" TEXT;
