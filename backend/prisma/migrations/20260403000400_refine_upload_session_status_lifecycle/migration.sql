ALTER TABLE "UploadSession" ALTER COLUMN "status" SET DEFAULT 'draft';

UPDATE "UploadSession"
SET "status" = CASE
  WHEN "status" = 'completed' THEN 'completed'
  WHEN "status" = 'failed' THEN 'failed'
  WHEN "status" = 'processing' THEN 'processing'
  WHEN "csvUploadStatus" = 'uploaded' OR "movUploadStatus" = 'uploaded' THEN 'ready'
  ELSE 'draft'
END
WHERE "status" IN ('uploaded', 'draft', 'ready', 'processing', 'completed', 'failed');
