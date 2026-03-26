const { createUploadSession } = require('../services/uploadSession.service');

async function create(req, res) {
  try {
    const userId = req.userId;

    const uploadSession = await createUploadSession(userId);

    res.status(201).json(uploadSession);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create upload session' });
  }
}

module.exports = {
  create,
};