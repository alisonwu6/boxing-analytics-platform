const { randomUUID } = require('crypto');
const sessionsRepository = require('../repositories/sessions.repository.js');

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

function formatDateOnly(isoString) {
  return isoString.slice(0, 10);
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date(isoString)).toLowerCase().replace(' ', '');
}

function buildAnalysisSummary(session) {
  const insights = [];

  if (session.csvFile) {
    insights.push(`Sensor dataset received: ${session.csvFile.originalName}`);
  }

  if (session.movFile) {
    insights.push(`Video received: ${session.movFile.originalName}`);
  }

  if (insights.length === 0) {
    insights.push('Waiting for upload');
  }

  return {
    ready: Boolean(session.csvFile || session.movFile),
    summary: insights,
  };
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

function normaliseSessionStatus(status) {
  const validStatuses = new Set(['uploaded', 'processing', 'completed', 'failed']);

  if (validStatuses.has(status)) {
    return status;
  }

  return 'uploaded';
}

function normaliseProcessingStatus(processingStatus) {
  const validStatuses = new Set([
    'uploaded',
    'queued',
    'preprocessing',
    'inferencing',
    'completed',
    'failed',
  ]);

  if (validStatuses.has(processingStatus)) {
    return processingStatus;
  }

  return 'uploaded';
}

function getUploadStatus(file) {
  return file ? 'uploaded' : 'missing';
}

function serialiseSession(session) {
  const startAt = session.sessionStartAt || session.createdAt;
  const endAt = session.sessionEndAt || session.updatedAt;

  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    sessionDate: session.sessionDate,
    sessionStartAt: startAt,
    sessionEndAt: endAt,
    date: formatDateOnly(session.sessionDate),
    type: session.sessionType,
    startTime: formatTime(startAt),
    endTime: formatTime(endAt),
    csvAvailable: Boolean(session.csvFile),
    csvUploadStatus: getUploadStatus(session.csvFile),
    movAvailable: Boolean(session.movFile),
    movUploadStatus: getUploadStatus(session.movFile),
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
  const sessionDate = session.sessionDate || `${session.date}T00:00:00.000Z`;

  return {
    id: session.id,
    title: session.title,
    date: formatDateOnly(sessionDate),
    type: sessionType,
    startTime: formatTime(startAt),
    endTime: formatTime(endAt),
    csvAvailable: Boolean(csvFile),
    csvUploadStatus: getUploadStatus(csvFile),
    movAvailable: Boolean(movFile),
    movUploadStatus: getUploadStatus(movFile),
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
    status: 'uploaded',
    processingStatus: 'uploaded',
    csvFile: null,
    movFile: null,
    analysis: {
      ready: false,
      summary: ['Waiting for upload'],
    },
    results: buildEmptyResults(),
    createdAt: now,
    updatedAt: now,
  };

  const created = await sessionsRepository.createSession(session);
  return serialiseSession(created);
}

function toStoredFile(file) {
  if (!file) {
    return null;
  }

  return {
    fieldName: file.fieldname,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storedName: file.filename,
    relativePath: file.path,
  };
}

async function attachFilesToSession(sessionId, files = {}) {
  const session = await sessionsRepository.findSessionById(sessionId);

  if (!session) {
    throw createHttpError(404, 'Upload session not found');
  }

  const csvFile = files.csvFile ? toStoredFile(files.csvFile) : session.csvFile;
  const movFile = files.movFile ? toStoredFile(files.movFile) : session.movFile;

  if (!csvFile && !movFile) {
    throw createHttpError(400, 'At least one CSV or MOV file is required');
  }

  const updatedAt = new Date().toISOString();

  const nextSession = {
    ...session,
    csvFile,
    movFile,
    processingStatus: 'uploaded',
    status: 'uploaded',
    analysis: buildAnalysisSummary({
      ...session,
      csvFile,
      movFile,
    }),
    updatedAt,
  };

  const saved = await sessionsRepository.updateSession(sessionId, nextSession);
  return serialiseSession(saved);
}

async function getSessions(filters = {}) {
  const sessions = await sessionsRepository.findAllSessions(filters);
  return sessions.map(serialiseSessionSummary);
}

async function getSessionById(id, userId) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, 'Session not found');
  }

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

async function startSessionAnalysis(id, userId) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, 'Session not found');
  }

  if (!session.csvFile && !session.movFile) {
    throw createHttpError(400, 'Session has no uploaded files');
  }

  const updatedAt = new Date().toISOString();
  const existingResults = session.results || buildEmptyResults();

  const nextSession = {
    ...session,
    status: 'processing',
    processingStatus: 'queued',
    results: {
      ...existingResults,
      errorMessage: null,
      processingStartedAt: existingResults.processingStartedAt || updatedAt,
      processingFinishedAt: null,
    },
    updatedAt,
  };

  const saved = await sessionsRepository.updateSession(id, nextSession);
  return {
    message: 'Session analysis started',
    sessionId: saved.id,
    status: saved.status,
    processingStatus: saved.processingStatus,
  };
}

async function updateSessionStatus(id, input = {}) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  const processingStatus = normaliseProcessingStatus(input.processingStatus);
  const status = input.status
    ? normaliseSessionStatus(input.status)
    : processingStatus === 'completed'
      ? 'completed'
      : processingStatus === 'failed'
        ? 'failed'
        : 'processing';

  const existingResults = session.results || buildEmptyResults();
  const updatedAt = new Date().toISOString();

  const nextSession = {
    ...session,
    status,
    processingStatus,
    results: {
      ...existingResults,
      modelVersion: input.modelVersion || existingResults.modelVersion,
      errorMessage: input.errorMessage ?? existingResults.errorMessage,
      processingStartedAt:
        input.processingStartedAt || existingResults.processingStartedAt,
      processingFinishedAt:
        input.processingFinishedAt || existingResults.processingFinishedAt,
    },
    updatedAt,
  };

  const saved = await sessionsRepository.updateSession(id, nextSession);
  const results = saved.results || buildEmptyResults();

  return {
    message: 'Session status updated',
    sessionId: saved.id,
    processingStatus: saved.processingStatus,
    status: saved.status,
    errorMessage: results.errorMessage,
    modelVersion: results.modelVersion,
    processingStartedAt: results.processingStartedAt,
    processingFinishedAt: results.processingFinishedAt,
    canFetchResults: saved.status === 'completed',
  };
}

async function saveSessionResults(id, input = {}) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  const updatedAt = new Date().toISOString();
  const processingStatus = input.processingStatus === 'failed' ? 'failed' : 'completed';
  const status = input.status
    ? normaliseSessionStatus(input.status)
    : processingStatus === 'failed'
      ? 'failed'
      : 'completed';

  const nextSession = {
    ...session,
    status,
    processingStatus,
    results: {
      modelVersion: input.modelVersion || null,
      resultSummary: input.resultSummary || [],
      metrics: input.metrics || [],
      punchEvents: input.punchEvents || [],
      artifacts: input.artifacts || {},
      errorMessage: input.errorMessage ?? null,
      processingStartedAt: input.processingStartedAt || session.results?.processingStartedAt || null,
      processingFinishedAt: input.processingFinishedAt || updatedAt,
    },
    updatedAt,
  };

  const saved = await sessionsRepository.updateSession(id, nextSession);

  return {
    message: 'Session results recorded',
    sessionId: saved.id,
    processingStatus: saved.processingStatus,
    status: saved.status,
    modelVersion: saved.results.modelVersion,
    resultSummary: saved.results.resultSummary,
  };
}

async function getSessionResults(id, userId) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  if (userId && session.userId !== userId) {
    throw createHttpError(404, 'Session not found');
  }

  if (normaliseSessionStatus(session.status) !== 'completed') {
    throw createHttpError(409, 'Session results are not ready');
  }

  return {
    sessionId: session.id,
    ...buildEmptyResults(),
    ...(session.results || {}),
  };
}

module.exports = {
  getSessions,
  getSessionById,
  getSessionStatus,
  createUploadSession,
  attachFilesToSession,
  startSessionAnalysis,
  updateSessionStatus,
  saveSessionResults,
  getSessionResults,
  serialiseSessionSummary,
};
