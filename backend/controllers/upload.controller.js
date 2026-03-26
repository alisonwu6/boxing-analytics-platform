const { updateUploadSession } = require('../services/uploadSession.service');

async function uploadFiles(req, res) {
  try {
    const { uploadSessionId } = req.body;

    if (!uploadSessionId) {
      return res.status(400).json({
        error: 'uploadSessionId is required',
      });
    }

    const csv = req.files.csvFile?.[0];
    const mov = req.files.movFile?.[0];

    const updateData = {};

    if (csv) {
      updateData.csvFilePath = csv.path;
      updateData.csvUploadStatus = 'uploaded';
    }

    if (mov) {
      updateData.movFilePath = mov.path;
      updateData.movUploadStatus = 'uploaded';
    }

    const session = await updateUploadSession(uploadSessionId, updateData);

    res.json({
      message: 'Files uploaded and session updated',
      session,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Upload failed',
    });
  }
}

module.exports = {
  uploadFiles,
};