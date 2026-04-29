const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type FileType = "csv" | "mov";

const getToken = () => {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt")
  );
};

const getAuthHeaders = (): HeadersInit => {
  const token = getToken();

  if (!token) return {};

  return {
    Authorization: `Bearer ${token}`,
  };
};

const getFileContentType = (file: File, fileType: FileType) => {
  if (file.type) return file.type;

  if (fileType === "csv") return "text/csv";
  if (fileType === "mov") return "video/quicktime";

  return "application/octet-stream";
};

export const createUploadSession = async () => {
  const res = await fetch(`${API_BASE_URL}/upload-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      title: "Boxing Session Upload",
      sessionType: "training",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create upload session failed: ${res.status} ${text}`);
  }

  return res.json();
};

export const createPresignedUrl = async (
  sessionId: string,
  file: File,
  fileType: FileType
) => {
  const contentType = getFileContentType(file, fileType);

  const res = await fetch(`${API_BASE_URL}/upload-sessions/${sessionId}/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      fileType,
      fileName: file.name,
      originalName: file.name,
      contentType,
      mimeType: contentType,
      size: file.size,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create presigned URL failed: ${res.status} ${text}`);
  }

  return res.json();
};

export const uploadToS3 = async (
  uploadUrl: string,
  file: File,
  contentType: string
) => {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("S3 PUT failed:", res.status, text);
    throw new Error(`S3 upload failed: ${res.status}`);
  }
};

export const completeUpload = async (
  sessionId: string,
  fileType: FileType,
  objectKey: string
) => {
  const res = await fetch(`${API_BASE_URL}/upload-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      fileType,
      objectKey,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Complete upload failed: ${res.status} ${text}`);
  }

  return res.json();
};

export const uploadFileForSession = async (
  sessionId: string,
  file: File,
  fileType: FileType
) => {
  const contentType = getFileContentType(file, fileType);

  const presignData = await createPresignedUrl(sessionId, file, fileType);

  console.log("Presign response:", presignData);

  const uploadUrl =
    presignData.uploadUrl ||
    presignData.url ||
    presignData.presignedUrl ||
    presignData.signedUrl;

  const objectKey =
    presignData.objectKey ||
    presignData.key ||
    presignData.s3Key ||
    presignData.fileKey ||
    presignData.data?.objectKey ||
    presignData.data?.key;

  const returnedContentType =
    presignData.contentType ||
    presignData.mimeType ||
    presignData.data?.contentType ||
    contentType;

  if (!uploadUrl) {
    throw new Error("Backend did not return uploadUrl.");
  }

  if (!objectKey) {
    throw new Error("Backend did not return objectKey/key for complete upload.");
  }

  await uploadToS3(uploadUrl, file, returnedContentType);

  const completeData = await completeUpload(sessionId, fileType, objectKey);

  return {
    presignData,
    completeData,
    objectKey,
  };
};