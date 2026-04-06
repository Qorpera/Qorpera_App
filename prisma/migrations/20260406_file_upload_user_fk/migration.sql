-- Make uploadedBy nullable and add FK to User with ON DELETE SET NULL
ALTER TABLE "FileUpload" ALTER COLUMN "uploadedBy" DROP NOT NULL;

ALTER TABLE "FileUpload"
  ADD CONSTRAINT "FileUpload_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FileUpload_uploadedBy_idx" ON "FileUpload"("uploadedBy");
