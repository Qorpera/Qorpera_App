-- Add lastModifiedById and lastModifiedAt to PolicyRule, SituationType, AppSetting
ALTER TABLE "PolicyRule" ADD COLUMN "lastModifiedById" TEXT;
ALTER TABLE "PolicyRule" ADD COLUMN "lastModifiedAt" TIMESTAMP(3);

ALTER TABLE "SituationType" ADD COLUMN "lastModifiedById" TEXT;
ALTER TABLE "SituationType" ADD COLUMN "lastModifiedAt" TIMESTAMP(3);

ALTER TABLE "AppSetting" ADD COLUMN "lastModifiedById" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "lastModifiedAt" TIMESTAMP(3);
