const fs = require('fs/promises');
const path = require('path');
const { fixtureSessions } = require('./sessions.fixtures');

const dataDirectory = path.join(__dirname, '..', 'data');
const sessionsFilePath = path.join(dataDirectory, 'sessions.json');

async function ensureStore() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(sessionsFilePath);
  } catch {
    await fs.writeFile(sessionsFilePath, '[]\n', 'utf8');
  }
}

async function readSessions() {
  await ensureStore();
  const raw = await fs.readFile(sessionsFilePath, 'utf8');

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...fixtureSessions];
    }

    if (parsed.length === 0) {
      return [...fixtureSessions];
    }

    return parsed;
  } catch {
    return [...fixtureSessions];
  }
}

async function writeSessions(sessions) {
  await ensureStore();
  await fs.writeFile(sessionsFilePath, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
}

async function findAllSessions(filters = {}) {
  const sessions = await readSessions();

  return sessions
    .filter((session) => {
      if (!filters.userId) {
        return true;
      }

      return session.userId === filters.userId;
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

async function findSessionById(id) {
  const sessions = await readSessions();
  return sessions.find((session) => session.id === id) || null;
}

async function createSession(session) {
  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
  return session;
}

async function updateSession(id, patch) {
  const sessions = await readSessions();
  const index = sessions.findIndex((session) => session.id === id);

  if (index === -1) {
    return null;
  }

  const nextSession = {
    ...sessions[index],
    ...patch,
  };

  sessions[index] = nextSession;
  await writeSessions(sessions);

  return nextSession;
}

module.exports = {
  findAllSessions,
  findSessionById,
  createSession,
  updateSession,
};
