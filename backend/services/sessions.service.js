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

function serialiseSession(session) {
  const startAt = session.sessionStartAt || session.createdAt;
  const endAt = session.sessionEndAt || session.updatedAt;

  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    notes: session.notes,
    sessionDate: session.sessionDate,
    sessionStartAt: startAt,
    sessionEndAt: endAt,
    date: formatDateOnly(session.sessionDate),
    type: session.sessionType,
    startTime: formatTime(startAt),
    endTime: formatTime(endAt),
    csvAvailable: Boolean(session.csvFile),
    movAvailable: Boolean(session.movFile),
    status: session.status,
    processingStatus: session.processingStatus,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    files: {
      csv: session.csvFile,
      mov: session.movFile,
    },
    analysis: session.analysis,
  };
}

async function createUploadSession(userId, input = {}) {
  const now = new Date().toISOString();

  const session = {
    id: randomUUID(),
    userId: userId || 'anonymous',
    title: input.title?.trim() || 'Boxing Session Upload',
    notes: input.notes?.trim() || '',
    sessionType: normaliseSessionType(input.sessionType),
    sessionDate: input.sessionDate || now,
    sessionStartAt: input.sessionStartAt || input.sessionDate || now,
    sessionEndAt: input.sessionEndAt || input.sessionDate || now,
    status: 'saved',
    processingStatus: 'pending',
    csvFile: null,
    movFile: null,
    analysis: {
      ready: false,
      summary: ['Waiting for upload'],
    },
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
  const processingStatus = csvFile || movFile ? 'complete' : 'pending';
  const status = processingStatus === 'complete' ? 'complete' : session.status;

  const nextSession = {
    ...session,
    csvFile,
    movFile,
    processingStatus,
    status,
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
  return sessions.map(serialiseSession);
}

async function getSessionById(id) {
  const session = await sessionsRepository.findSessionById(id);

  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  return serialiseSession(session);
}

module.exports = {
  getSessions,
  getSessionById,
  createUploadSession,
  attachFilesToSession,
};
