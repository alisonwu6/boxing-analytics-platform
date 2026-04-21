const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const fs = require('fs/promises');

const execFileAsync = promisify(execFile);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getProjectRoot() {
  return path.resolve(__dirname, '../..');
}

function resolvePythonBin() {
  return process.env.PYTHON_BIN || 'python3';
}

function resolveInferenceScriptPath() {
  return process.env.ML_INFERENCE_SCRIPT
    ? path.resolve(process.env.ML_INFERENCE_SCRIPT)
    : path.join(getProjectRoot(), 'ml', 'run_inference.py');
}

function getS3Bucket() {
  const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw createHttpError(500, 'S3 bucket is not configured');
  }
  return bucket;
}

function getAwsRegion() {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    'ap-southeast-2'
  );
}

async function assertFileExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw createHttpError(500, `${label} not found: ${filePath}`);
  }
}

async function runSessionInference(session) {
  if (!session.csvKey) {
    throw createHttpError(400, 'Session has no CSV file to infer from');
  }

  const scriptPath = resolveInferenceScriptPath();
  await assertFileExists(scriptPath, 'ML inference script');

  const args = [
    scriptPath,
    '--session-id', session.id,
    '--bucket',     getS3Bucket(),
    '--region',     getAwsRegion(),
    '--csv-key',    session.csvKey,
  ];

  if (session.movKey) {
    args.push('--mov-key', session.movKey);
  }

  const { stdout, stderr } = await execFileAsync(resolvePythonBin(), args, {
    cwd: getProjectRoot(),
    maxBuffer: 1024 * 1024,
  });

  if (stderr && stderr.trim()) {
    console.warn(stderr.trim());
  }

  let payload;

  try {
    payload = JSON.parse(stdout);
  } catch {
    throw createHttpError(500, 'ML inference output was not valid JSON');
  }

  return { payload };
}

module.exports = {
  runSessionInference,
};
