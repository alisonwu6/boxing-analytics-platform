const { randomUUID } = require('crypto');
const sessionsRepository = require('../repositories/sessions.repository.js');
const {
  assertObjectExists,
  createPresignedUpload,
  createPresignedDownload,
  normaliseFileType,
} = require('./s3-upload.service');
const { runSessionInference } = require('./ml-inference.service');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normaliseSessionType(sessionType) {
  if (sessionType === 'match') {
    return 'match';
  }

  return 'training';
}

function buildEmptyResults() {
  return {
    modelVersion: null,
    resultSummary: [],
    metrics: [],
    punchEvents: [],
    artifacts: {},
    errorMessage: null,
    processingStartedAt: null,
    processingFinishedAt: null,
  };
}


function normaliseAnalysisOptions(input = {}, hasCsv = false) {
  const {
    model = 'mediapipe',
    duration,
    imuAnalysis = false,
    syncMode = 'none',
    offsetR,
    offsetL,
    jumpWindowStart,
    jumpWindowEnd,
    renderVideo = true,
    exportExcel = true,
    exportCsv = true,
  } = input || {};

  if (!['mediapipe', 'yolo'].includes(model)) {
    throw createHttpError(400, 'Invalid model. Use mediapipe or yolo.');
  }

  if (!['none', 'manual', 'auto'].includes(syncMode)) {
    throw createHttpError(400, 'Invalid sync mode.');
  }

  const safeDuration = duration !== undefined && duration !== null && duration !== ''
    ? Number(duration)
    : undefined;

  if (safeDuration !== undefined && (!Number.isFinite(safeDuration) || safeDuration <= 0)) {
    throw createHttpError(400, 'Duration must be a positive number.');
  }

  if (imuAnalysis && !hasCsv) {
    throw createHttpError(400, 'IMU analysis requires a CSV / IMU file.');
  }

  if (syncMode !== 'none' && !hasCsv) {
    throw createHttpError(400, 'Sync requires a CSV / IMU file.');
  }

  const safeOffsetR = offsetR !== undefined && offsetR !== null && offsetR !== ''
    ? Number(offsetR)
    : undefined;
  const safeOffsetL = offsetL !== undefined && offsetL !== null && offsetL !== ''
    ? Number(offsetL)
    : undefined;

  if (safeOffsetR !== undefined && !Number.isFinite(safeOffsetR)) {
    throw createHttpError(400, 'offsetR must be a valid number.');
  }

  if (safeOffsetL !== undefined && !Number.isFinite(safeOffsetL)) {
    throw createHttpError(400, 'offsetL must be a valid number.');
  }

  if (syncMode === 'manual' && safeOffsetR === undefined && safeOffsetL === undefined) {
    throw createHttpError(400, 'Manual sync requires offsetR or offsetL.');
  }

  const safeJumpWindowStart = jumpWindowStart !== undefined && jumpWindowStart !== null && jumpWindowStart !== ''
    ? Number(jumpWindowStart)
    : undefined;
  const safeJumpWindowEnd = jumpWindowEnd !== undefined && jumpWindowEnd !== null && jumpWindowEnd !== ''
    ? Number(jumpWindowEnd)
    : undefined;

  if (syncMode === 'auto') {
    if (safeJumpWindowStart === undefined || safeJumpWindowEnd === undefined) {
      throw createHttpError(400, 'Auto sync requires jumpWindowStart and jumpWindowEnd.');
    }

    if (!Number.isFinite(safeJumpWindowStart) || !Number.isFinite(safeJumpWindowEnd)) {
      throw createHttpError(400, 'Jump window values must be valid numbers.');
    }

    if (safeJumpWindowStart >= safeJumpWindowEnd) {
      throw createHttpError(400, 'jumpWindowStart must be smaller than jumpWindowEnd.');
    }
  }

  return {
    model,
    duration: safeDuration,
    imuAnalysis: Boolean(imuAnalysis),
    syncMode,
    offsetR: safeOffsetR,
    offsetL: safeOffsetL,
    jumpWindowStart: safeJumpWindowStart,
    jumpWindowEnd: safeJumpWindowEnd,
    renderVideo: Boolean(renderVideo),
    exportExcel: Boolean(exportExcel),
    exportCsv: Boolean(exportCsv),
  };
}

function normaliseSessionStatus(status) {
  const validStatuses = new Set(['draft', 'ready', 'processing', 'completed', 'failed']);

  if (validStatuses.has(status)) {
    return status;
  }

  return 'draft';
}

function normaliseProcessingStatus(processingStatus) {
  const validStatuses = new Set([
    'idle',
    'queued',
    'preprocessing',
    'inferencing',
    'completed',
    'failed',
  ]);

  if (validStatuses.has(processingStatus)) {
    return processingStatus;
  }

  return 'idle';
}

function getUploadStatus(file, key, explicitStatus) {
  if (explicitStatus === 'uploaded' || explicitStatus === 'failed') {
    return explicitStatus;
  }

  return file || key ? 'uploaded' : 'missing';
}

function serialiseSession(session) {
  const startAt = session.sessionStartAt || session.createdAt;
  const endAt = session.sessionEndAt || session.updatedAt;
  const csvUploadStatus = getUploadStatus(
    session.csvFile,
    session.csvKey,
    session.csvUploadStatus
  );
  const movUploadStatus = getUploadStatus(
    session.movFile,
    session.movKey,
    session.movUploadStatus
  );

  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    sessionDate: session.sessionDate,
    sessionStartAt: startAt,
    sessionEndAt: endAt,
    sessionType: session.sessionType,
    csvUploadStatus,
    movUploadStatus,
    status: session.status,
    processingStatus: session.processingStatus,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function serialiseSessionSummary(session) {
  const startAt = session.sessionStartAt || session.createdAt;
  const endAt = session.sessionEndAt || session.updatedAt;
  const sessionType = session.sessionType || session.type;
  const csvFile = session.csvFile || session.files?.csv || null;
  const movFile = session.movFile || session.files?.mov || null;
  const sessionDate = session.sessionDate || session.createdAt;
  const csvKey = session.csvKey || null;
  const movKey = session.movKey || null;

  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    sessionDate,
    sessionStartAt: startAt,
    sessionEndAt: endAt,
    sessionType,
    csvUploadStatus: getUploadStatus(csvFile, csvKey, session.csvUploadStatus),
    movUploadStatus: getUploadStatus(movFile, movKey, session.movUploadStatus),
    status: session.status,
    processingStatus: session.processingStatus,
  };
}

async function createUploadSession(userId, input = {}) {
  const now = new Date().toISOString();

  const session = {
    id: randomUUID(),
    userId: userId || 'anonymous',
    title: input.title?.trim() || 'Boxing Session Upload',
    sessionType: normaliseSessionType(input.sessionType),
    sessionDate: input.sessionDate || now,
    sessionStartAt: input.sessionStartAt || input.sessionDate || now,
    sessionEndAt: input.sessionEndAt || input.sessionDate || now,
    csvKey: null,
    movKey: null,
    csvUploadStatus: 'missing',
    movUploadStatus: 'missing',
    status: 'draft',
    processingStatus: 'idle',
    results: buildEmptyResults(),
    createdAt: now,
    updatedAt: now,
  };

  const created = await sessionsRepository.createSession(session);
  return serialiseSession(created);
}

async function getSessions(filters = {}) {
  const sessions = await sessionsRepository.findAllSessions(filters);
  return sessions.map(serialiseSessionSummary);
}

async function findOwnedSession(id, userId, notFoundMessage = 'Session not found') {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, notFoundMessage);
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, notFoundMessage);
  }

  return session;
}

async function getSessionById(id, userId) {
  const session = await findOwnedSession(id, userId, 'Session not found');

  return serialiseSession(session);
}

async function getSessionStatus(id, userId) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, 'Session not found');
  }

  const results = session.results || buildEmptyResults();

  return {
    sessionId: session.id,
    status: normaliseSessionStatus(session.status),
    processingStatus: normaliseProcessingStatus(session.processingStatus),
    modelVersion: results.modelVersion,
    errorMessage: results.errorMessage,
    processingStartedAt: results.processingStartedAt,
    processingFinishedAt: results.processingFinishedAt,
    canFetchResults: normaliseSessionStatus(session.status) === 'completed',
  };
}

async function startSessionAnalysis(id, userId, analysisOptions = {}) {
  console.log("[ANALYZE SERVICE] request received:", {
    sessionId: id,
    userId,
  });

  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, "Session not found");
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, "Session not found");
  }

  const hasCsv = Boolean(session.csvKey || session.csvFile);
  const hasMov = Boolean(session.movKey || session.movFile);
  const safeAnalysisOptions = normaliseAnalysisOptions(analysisOptions, hasCsv);

  if (!hasCsv && !hasMov) {
    throw createHttpError(
      400,
      "Please upload at least one file before running analysis."
    );
  }

  const analysisMode = hasCsv && hasMov ? "full" : hasCsv ? "csv_only" : "video_only";

  console.log("[ANALYZE SERVICE] analysis mode:", {
    sessionId: session.id,
    analysisMode,
    hasCsv,
    hasMov,
  });

  if (session.status === "processing") {
    return {
      message: "Session analysis is already running",
      sessionId: session.id,
      status: session.status,
      processingStatus: session.processingStatus,
      analysisMode,
    };
  }

  const updatedAt = new Date().toISOString();
  const existingResults = session.results || buildEmptyResults();

  const nextSession = {
    ...session,
    status: "processing",
    processingStatus: "queued",
    results: {
      ...existingResults,
      errorMessage: null,
      processingStartedAt: updatedAt,
      processingFinishedAt: null,
      analysisOptions: safeAnalysisOptions,
    },
    updatedAt,
  };

  const saved = await sessionsRepository.updateSession(id, nextSession);

  setImmediate(() => {
    _runInferenceBackground(saved, safeAnalysisOptions).catch((error) => {
      console.error("[ANALYZE SERVICE] background job crashed:", {
        sessionId: saved.id,
        message: error.message,
        stack: error.stack,
      });
    });
  });

  return {
    message:
      analysisMode === "full"
        ? "Full analysis started"
        : analysisMode === "video_only"
          ? "Video analysis started"
          : "CSV insights analysis started",
    sessionId: saved.id,
    status: saved.status,
    processingStatus: saved.processingStatus,
    analysisMode,
    analysisOptions: safeAnalysisOptions,
  };
}

async function _runInferenceBackground(session, analysisOptions = {}) {
  const startedAt =
    session.results?.processingStartedAt || new Date().toISOString();

  console.log("[ANALYZE JOB] background job started:", {
    sessionId: session.id,
    csvKey: session.csvKey,
    movKey: session.movKey,
    python: process.env.PYTHON_BIN,
  });

  try {
    const inferencingAt = new Date().toISOString();

    const runningSession = {
      ...session,
      status: "processing",
      processingStatus: "inferencing",
      results: {
        ...(session.results || buildEmptyResults()),
        errorMessage: null,
        processingStartedAt: startedAt,
        processingFinishedAt: null,
        analysisOptions,
      },
      updatedAt: inferencingAt,
    };

    await sessionsRepository.updateSession(session.id, runningSession);

    const { payload } = await runSessionInference(runningSession);

    const finishedAt = new Date().toISOString();

    const latestSession =
      (await sessionsRepository.findSessionById(session.id)) || runningSession;

    await sessionsRepository.updateSession(session.id, {
      ...latestSession,
      status: "completed",
      processingStatus: "completed",
      results: {
        ...buildEmptyResults(),
        ...payload,
        errorMessage: null,
        processingStartedAt: startedAt,
        processingFinishedAt: finishedAt,
        analysisOptions,
      },
      updatedAt: finishedAt,
    });

    console.log("[ANALYZE JOB] session completed:", {
      sessionId: session.id,
      finishedAt,
      annotatedVideoKey: payload?.artifacts?.annotatedVideoKey,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();

    console.error("[ML inference failed]", {
      sessionId: session.id,
      message: error.message,
      stack: error.stack,
    });

    try {
      const latestSession =
        (await sessionsRepository.findSessionById(session.id)) || session;

      await sessionsRepository.updateSession(session.id, {
        ...latestSession,
        status: "failed",
        processingStatus: "failed",
        results: {
          ...buildEmptyResults(),
          ...(latestSession.results || {}),
          errorMessage: error.message || "Inference failed",
          processingStartedAt: startedAt,
          processingFinishedAt: finishedAt,
          analysisOptions: latestSession.results?.analysisOptions || analysisOptions,
        },
        updatedAt: finishedAt,
      });
    } catch (updateError) {
      console.error("[ANALYZE JOB] failed to update failed status:", {
        sessionId: session.id,
        message: updateError.message,
        stack: updateError.stack,
      });
    }
  }
}

async function getSessionResults(id, userId) {
  const session = await findOwnedSession(id, userId, 'Session not found');

  if (normaliseSessionStatus(session.status) !== 'completed') {
    throw createHttpError(409, 'Session results are not ready');
  }

  return {
    sessionId: session.id,
    ...buildEmptyResults(),
    ...(session.results || {}),
  };
}

async function createUploadPresign(id, userId, input = {}) {
  const session = await findOwnedSession(id, userId, 'Upload session not found');
  const fileType = normaliseFileType(input.fileType);
  const presignedUpload = await createPresignedUpload({
    userId: session.userId,
    sessionId: session.id,
    fileType,
    contentType: input.contentType,
    originalFileName: input.originalFileName,
  });
  const patch =
    fileType === 'csv'
      ? { csvKey: presignedUpload.key }
      : { movKey: presignedUpload.key };

  await sessionsRepository.updateSession(id, {
    ...session,
    ...patch,
  });

  return {
    uploadSessionId: session.id,
    fileType,
    bucket: presignedUpload.bucket,
    key: presignedUpload.key,
    uploadUrl: presignedUpload.uploadUrl,
    expiresIn: presignedUpload.expiresIn,
    region: presignedUpload.region,
  };
}

async function completeUploadSessionFile(id, userId, input = {}) {
  const session = await findOwnedSession(id, userId, 'Upload session not found');
  const fileType = normaliseFileType(input.fileType);
  const key = input.key?.trim();

  if (!key) {
    throw createHttpError(400, 'key is required');
  }

  if (fileType === 'csv' && session.csvKey && session.csvKey !== key) {
    throw createHttpError(400, 'key does not match the presigned CSV upload');
  }

  if (fileType === 'mov' && session.movKey && session.movKey !== key) {
    throw createHttpError(400, 'key does not match the presigned MOV upload');
  }

  await assertObjectExists(key);

  const nextCsvKey = fileType === 'csv' ? key : session.csvKey;
  const nextMovKey = fileType === 'mov' ? key : session.movKey;

  const nextSession = {
    ...session,
    csvKey: nextCsvKey,
    movKey: nextMovKey,
    csvUploadStatus: fileType === 'csv' ? 'uploaded' : session.csvUploadStatus,
    movUploadStatus: fileType === 'mov' ? 'uploaded' : session.movUploadStatus,
    status: nextCsvKey || nextMovKey ? 'ready' : 'draft',
    processingStatus: 'idle',
    updatedAt: new Date().toISOString(),
  };

  await sessionsRepository.updateSession(id, nextSession);
  return getSessionById(id, userId);
}

async function getSessionVideoUrl(id, userId) {
  const session = await findOwnedSession(id, userId, 'Session not found');

  const results = session.results || {};
  const annotatedVideoKey = results.artifacts?.annotatedVideoKey;

  if (!annotatedVideoKey) {
    throw createHttpError(404, 'No annotated video available for this session');
  }

  const { url, expiresIn } = await createPresignedDownload(annotatedVideoKey);

  return { videoUrl: url, expiresIn };
}

module.exports = {
  getSessions,
  getSessionById,
  getSessionStatus,
  createUploadSession,
  startSessionAnalysis,
  getSessionResults,
  getSessionVideoUrl,
  createUploadPresign,
  completeUploadSessionFile,
  serialiseSessionSummary,
};
