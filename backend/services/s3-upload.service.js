const path = require('path');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getAwsRegion() {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    'ap-southeast-2'
  );
}

function getBucketName() {
  const bucketName = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

  if (!bucketName) {
    throw createHttpError(500, 'S3 bucket is not configured');
  }

  return bucketName;
}

function normaliseFileType(fileType) {
  if (fileType === 'csv' || fileType === 'mov') {
    return fileType;
  }

  throw createHttpError(400, 'fileType must be csv or mov');
}

function getExpectedExtension(fileType) {
  return fileType === 'csv' ? '.csv' : '.mov';
}

function sanitiseBaseName(filename) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildObjectKey({ userId, sessionId, fileType, originalFileName }) {
  const extension = getExpectedExtension(fileType);
  const parsedName = path.parse(originalFileName || '');
  const safeBaseName = sanitiseBaseName(parsedName.name || fileType);
  const fallbackName = fileType === 'csv' ? 'imu' : 'video';
  const objectName = `${safeBaseName || fallbackName}${extension}`;

  return `uploads/${userId}/${sessionId}/${objectName}`;
}

function createS3Client() {
  let S3Client;

  try {
    ({ S3Client } = require('@aws-sdk/client-s3'));
  } catch {
    throw createHttpError(500, 'AWS S3 SDK is not installed');
  }

  return new S3Client({
    region: getAwsRegion(),
  });
}

async function createPresignedUpload({ userId, sessionId, fileType, contentType, originalFileName }) {
  let PutObjectCommand;
  let getSignedUrl;

  try {
    ({ PutObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
  } catch {
    throw createHttpError(500, 'AWS S3 SDK is not installed');
  }

  const normalisedFileType = normaliseFileType(fileType);
  const bucket = getBucketName();
  const key = buildObjectKey({
    userId,
    sessionId,
    fileType: normalisedFileType,
    originalFileName,
  });
  const client = createS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || (normalisedFileType === 'csv' ? 'text/csv' : 'video/quicktime'),
  });
  const expiresIn = 900;
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    bucket,
    key,
    uploadUrl,
    expiresIn,
    fileType: normalisedFileType,
    region: getAwsRegion(),
  };
}

async function assertObjectExists(key) {
  let HeadObjectCommand;

  try {
    ({ HeadObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    throw createHttpError(500, 'AWS S3 SDK is not installed');
  }

  const client = createS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    );
  } catch (error) {
    const httpCode = error?.$metadata?.httpStatusCode;

    if (httpCode === 404 || httpCode === 403 || error?.name === 'NotFound') {
      throw createHttpError(409, 'Uploaded object was not found in S3');
    }

    throw error;
  }
}

module.exports = {
  assertObjectExists,
  createHttpError,
  createPresignedUpload,
  normaliseFileType,
};
