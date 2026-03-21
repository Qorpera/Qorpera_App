-- Day 16: Admin-initiated promotion tracking on PersonalAutonomy
ALTER TABLE "PersonalAutonomy" ADD COLUMN "promotedAt" TIMESTAMP(3);
ALTER TABLE "PersonalAutonomy" ADD COLUMN "promotedById" TEXT;
