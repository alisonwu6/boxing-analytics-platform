const { updateUploadSession } = require('../services/uploadSession.service');
const { createUploadSession } = require('../services/uploadSession.service');

async function uploadFiles(req, res) {
  try {
    const uploadSessionId = req.body?.uploadSessionId;
    const csvFile = req.files?.csvFile?.[0] || null;
    const movFile = req.files?.movFile?.[0] || null;

    if (!csvFile && !movFile) {
      return res.status(400).json({
        error: 'At least one CSV or MOV file is required',
      });
    }

    let sessionId = uploadSessionId;
    let created = false;

    if (!sessionId) {
      const uploadSession = await createUploadSession(req.userId, req.body);
      sessionId = uploadSession.id;
      created = true;
    }

    const session = await updateUploadSession(sessionId, {
      csvFile,
      movFile,
    });

    res.status(created ? 201 : 200).json({
      message: 'Files uploaded and session updated',
      session,
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || 'Upload failed',
    });
  }
}

module.exports = {
  uploadFiles,
};
