const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs/promises");

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getProjectRoot() {
  return path.resolve(__dirname, "../..");
}

function resolvePythonBin() {
  return process.env.PYTHON_BIN || "python";
}

function resolveInferenceScriptPath() {
  return process.env.ML_INFERENCE_SCRIPT
    ? path.resolve(process.env.ML_INFERENCE_SCRIPT)
    : path.join(getProjectRoot(), "ml", "run_inference.py");
}

function getS3Bucket() {
  const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

  if (!bucket) {
    throw createHttpError(500, "S3 bucket is not configured");
  }

  return bucket;
}

function getAwsRegion() {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    "ap-southeast-2"
  );
}

async function assertFileExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw createHttpError(500, `${label} not found: ${filePath}`);
  }
}

function buildChildEnv() {
  const childEnv = {
    ...process.env,
    AWS_REGION: getAwsRegion(),
    AWS_DEFAULT_REGION: getAwsRegion(),
  };

  // Force AWS SDK / boto3 to use the .env credentials, not local AWS profile.
  delete childEnv.AWS_PROFILE;
  delete childEnv.AWS_DEFAULT_PROFILE;

  return childEnv;
}

function extractJsonPayload(stdout) {
  const trimmed = stdout.trim();

  if (!trimmed) {
    throw createHttpError(500, "ML inference produced empty stdout");
  }

  // Best case: stdout is pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fallback below.
  }

  // Fallback: if logs accidentally entered stdout, find the final JSON object.
  const possibleStarts = [];

  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === "{") {
      possibleStarts.push(i);
    }
  }

  for (let i = possibleStarts.length - 1; i >= 0; i -= 1) {
    const candidate = trimmed.slice(possibleStarts[i]);

    try {
      return JSON.parse(candidate);
    } catch {
      // Try earlier "{"
    }
  }

  console.error("[ML SERVICE] Raw stdout was not valid JSON:");
  console.error(trimmed.slice(0, 3000));

  throw createHttpError(500, "ML inference output was not valid JSON");
}

function runPythonProcess(pythonBin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    console.log("[ML SERVICE] spawning Python process:");
    console.log("[ML SERVICE] python:", pythonBin);
    console.log("[ML SERVICE] cwd:", options.cwd);
    console.log("[ML SERVICE] args:", args.join(" "));

    const child = spawn(pythonBin, args, {
      cwd: options.cwd,
      env: buildChildEnv(),
      shell: false,
      windowsHide: false,
    });

    let stdout = "";
    let stderr = "";

    const timeoutMs = Number(process.env.ML_INFERENCE_TIMEOUT_MS || 0);
    let timeoutHandle = null;

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        console.error("[ML SERVICE] Python process timed out:", {
          timeoutMs,
        });

        child.kill("SIGTERM");

        reject(
          createHttpError(
            500,
            `ML inference timed out after ${Math.round(timeoutMs / 1000)} seconds`
          )
        );
      }, timeoutMs);
    }

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;

      // Do not print full JSON if it is very large.
      const preview = text.length > 800 ? `${text.slice(0, 800)}...` : text;
      console.log("[PYTHON stdout]", preview);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;

      // Video pipeline progress is usually printed here.
      console.error("[PYTHON stderr]", text);
    });

    child.on("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      console.error("[PYTHON spawn error]", {
        message: error.message,
        stack: error.stack,
      });

      reject(
        createHttpError(
          500,
          `Failed to start Python process: ${error.message}`
        )
      );
    });

    child.on("close", (code, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      console.log("[PYTHON exit]", {
        code,
        signal,
        durationSeconds,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });

      if (code !== 0) {
        console.error("[ML SERVICE] Python failed stderr preview:");
        console.error(stderr.slice(-3000));

        reject(
          createHttpError(
            500,
            `ML inference failed with exit code ${code}. ${stderr
              .slice(-800)
              .trim()}`
          )
        );
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function runSessionInference(session, analysisOptions = {}) {
  console.log("[ML SERVICE] runSessionInference entered:", {
    sessionId: session.id,
    csvKey: session.csvKey,
    movKey: session.movKey,
    python: resolvePythonBin(),
    bucket: getS3Bucket(),
    region: getAwsRegion(),
    analysisOptions,
  });

  if (!session.csvKey && !session.movKey) {
    throw createHttpError(400, "Session has no CSV or MOV file to infer from");
  }

  const scriptPath = resolveInferenceScriptPath();
  await assertFileExists(scriptPath, "ML inference script");

  const {
    model = "mediapipe",
    duration,
    imuAnalysis = false,
    syncMode = "none",
    offsetR,
    offsetL,
    jumpWindowStart,
    jumpWindowEnd,
    renderVideo = true,
    exportExcel = true,
    exportCsv = true,
  } = analysisOptions || {};


  const args = [
    scriptPath,
    "--session-id",
    session.id,
    "--bucket",
    getS3Bucket(),
    "--region",
    getAwsRegion(),
  ];

  if (session.csvKey) {
    args.push("--csv-key", session.csvKey);
  }

  if (session.movKey) {
    args.push("--mov-key", session.movKey);
  }

  args.push("--model", model);

  if (duration !== undefined && duration !== null && duration !== "") {
    args.push("--duration", String(duration));
  }

  if (imuAnalysis) {
    args.push("--imu-analysis");
  }

  if (syncMode === "manual") {
    args.push("--sync");

    if (offsetR !== undefined && offsetR !== null) {
      args.push("--offset-r", String(offsetR));
    }

    if (offsetL !== undefined && offsetL !== null) {
      args.push("--offset-l", String(offsetL));
    }
  }

  if (syncMode === "auto") {
    args.push("--sync");
    args.push("--sync-auto");
    args.push("--jump-window", String(jumpWindowStart), String(jumpWindowEnd));
  }

  if (!renderVideo) {
    args.push("--no-render");
  }

  if (!exportExcel) {
    args.push("--no-excel");
  }

  if (!exportCsv) {
    args.push("--no-csv");
  }


  console.log("[ML SERVICE] about to run inference:", {
    scriptPath,
    hasCsv: Boolean(session.csvKey),
    hasMov: Boolean(session.movKey),
    analysisOptions,
  });

  const { stdout } = await runPythonProcess(resolvePythonBin(), args, {
    cwd: getProjectRoot(),
  });

  const payload = extractJsonPayload(stdout);

  console.log("[ML SERVICE] parsed ML payload:", {
    modelVersion: payload?.modelVersion,
    metricsCount: Array.isArray(payload?.metrics) ? payload.metrics.length : 0,
    punchEventsCount: Array.isArray(payload?.punchEvents)
      ? payload.punchEvents.length
      : 0,
    hasAnnotatedVideoKey: Boolean(payload?.artifacts?.annotatedVideoKey),
  });

  return { payload };
}

module.exports = {
  runSessionInference,
};