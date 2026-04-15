ALTER TABLE "UploadSession"
ALTER COLUMN "processingStatus" SET DEFAULT 'idle';

UPDATE "UploadSession"
SET "processingStatus" = 'idle'
WHERE "processingStatus" = 'uploaded';
