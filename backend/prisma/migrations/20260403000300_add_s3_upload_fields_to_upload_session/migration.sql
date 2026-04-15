ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "csvKey" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "movKey" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "csvUploadStatus" TEXT NOT NULL DEFAULT 'missing';
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "movUploadStatus" TEXT NOT NULL DEFAULT 'missing';

UPDATE "UploadSession"
SET
  "csvUploadStatus" = CASE
    WHEN "csvUploadStatus" = 'uploaded' THEN 'uploaded'
    WHEN "csvFileData" IS NOT NULL OR "csvKey" IS NOT NULL THEN 'uploaded'
    ELSE 'missing'
  END,
  "movUploadStatus" = CASE
    WHEN "movUploadStatus" = 'uploaded' THEN 'uploaded'
    WHEN "movFileData" IS NOT NULL OR "movKey" IS NOT NULL THEN 'uploaded'
    ELSE 'missing'
  END;
