const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function createUploadSession(userId) {
  return prisma.uploadSession.create({
    data: {
      userId,
    },
  });
}

async function getUploadSessionById(id) {
  return prisma.uploadSession.findUnique({
    where: { id },
  });
}

async function updateUploadSession(id, data) {
  return prisma.uploadSession.update({
    where: { id },
    data,
  });
}

module.exports = {
  createUploadSession,
  getUploadSessionById,
  updateUploadSession,
};