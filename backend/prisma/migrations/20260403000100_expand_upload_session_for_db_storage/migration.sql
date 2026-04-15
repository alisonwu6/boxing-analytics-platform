ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Boxing Session Upload';
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "sessionType" TEXT NOT NULL DEFAULT 'training';
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "sessionStartAt" TIMESTAMP(3);
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "sessionEndAt" TIMESTAMP(3);
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'uploaded';
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "csvFileData" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "movFileData" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "analysisData" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "resultsData" TEXT;

UPDATE "UploadSession"
SET
  "title" = COALESCE("title", 'Boxing Session Upload'),
  "notes" = COALESCE("notes", ''),
  "sessionType" = COALESCE("sessionType", 'training'),
  "sessionDate" = COALESCE("sessionDate", "createdAt"),
  "sessionStartAt" = COALESCE("sessionStartAt", "createdAt"),
  "sessionEndAt" = COALESCE("sessionEndAt", "updatedAt"),
  "status" = CASE
    WHEN "processingStatus" = 'completed' THEN 'completed'
    WHEN "processingStatus" = 'failed' THEN 'failed'
    WHEN "processingStatus" IN ('queued', 'preprocessing', 'inferencing') THEN 'processing'
    ELSE 'uploaded'
  END,
  "csvFileData" = CASE
    WHEN "csvFileData" IS NOT NULL THEN "csvFileData"
    WHEN "csvFilePath" IS NULL THEN NULL
    ELSE json_build_object('relativePath', "csvFilePath")::text
  END,
  "movFileData" = CASE
    WHEN "movFileData" IS NOT NULL THEN "movFileData"
    WHEN "movFilePath" IS NULL THEN NULL
    ELSE json_build_object('relativePath', "movFilePath")::text
  END;

ALTER TABLE "UploadSession" DROP COLUMN IF EXISTS "csvFilePath";
ALTER TABLE "UploadSession" DROP COLUMN IF EXISTS "movFilePath";
ALTER TABLE "UploadSession" DROP COLUMN IF EXISTS "csvUploadStatus";
ALTER TABLE "UploadSession" DROP COLUMN IF EXISTS "movUploadStatus";

DROP INDEX IF EXISTS "UploadSession_userId_idx";
CREATE INDEX "UploadSession_userId_idx" ON "UploadSession"("userId");
