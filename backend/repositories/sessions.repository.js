const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

function serialiseDate(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringifyJson(value) {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function toDomainSession(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    sessionType: record.sessionType,
    sessionDate: serialiseDate(record.sessionDate),
    sessionStartAt: serialiseDate(record.sessionStartAt),
    sessionEndAt: serialiseDate(record.sessionEndAt),
    status: record.status,
    processingStatus: record.processingStatus,
    csvFile: parseJson(record.csvFileData),
    movFile: parseJson(record.movFileData),
    analysis: parseJson(record.analysisData),
    results: parseJson(record.resultsData),
    createdAt: serialiseDate(record.createdAt),
    updatedAt: serialiseDate(record.updatedAt),
  };
}

function assignIfPresent(target, source, key, transform = (value) => value) {
  if (!(key in source)) {
    return;
  }

  const value = source[key];
  target[key] = value == null ? null : transform(value);
}

function toPersistenceInput(session) {
  const data = {};

  assignIfPresent(data, session, 'id');
  assignIfPresent(data, session, 'userId');
  assignIfPresent(data, session, 'title');
  assignIfPresent(data, session, 'sessionType');
  assignIfPresent(data, session, 'sessionDate', (value) => new Date(value));
  assignIfPresent(data, session, 'sessionStartAt', (value) => new Date(value));
  assignIfPresent(data, session, 'sessionEndAt', (value) => new Date(value));
  assignIfPresent(data, session, 'status');
  assignIfPresent(data, session, 'processingStatus');
  assignIfPresent(data, session, 'csvFile', stringifyJson);
  assignIfPresent(data, session, 'movFile', stringifyJson);
  assignIfPresent(data, session, 'analysis', stringifyJson);
  assignIfPresent(data, session, 'results', stringifyJson);
  assignIfPresent(data, session, 'createdAt', (value) => new Date(value));
  assignIfPresent(data, session, 'updatedAt', (value) => new Date(value));

  if ('csvFile' in data) {
    data.csvFileData = data.csvFile;
    delete data.csvFile;
  }

  if ('movFile' in data) {
    data.movFileData = data.movFile;
    delete data.movFile;
  }

  if ('analysis' in data) {
    data.analysisData = data.analysis;
    delete data.analysis;
  }

  if ('results' in data) {
    data.resultsData = data.results;
    delete data.results;
  }

  return data;
}

async function findAllSessions(filters = {}) {
  const sessions = await prisma.uploadSession.findMany({
    where: filters.userId ? { userId: filters.userId } : undefined,
    orderBy: {
      createdAt: 'desc',
    },
  });

  return sessions.map(toDomainSession);
}

async function findSessionById(id) {
  const session = await prisma.uploadSession.findUnique({
    where: { id },
  });

  return toDomainSession(session);
}

async function createSession(session) {
  const created = await prisma.uploadSession.create({
    data: toPersistenceInput(session),
  });

  return toDomainSession(created);
}

async function updateSession(id, patch) {
  try {
    const updated = await prisma.uploadSession.update({
      where: { id },
      data: toPersistenceInput(patch),
    });

    return toDomainSession(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return null;
    }

    throw error;
  }
}

module.exports = {
  findAllSessions,
  findSessionById,
  createSession,
  updateSession,
};
