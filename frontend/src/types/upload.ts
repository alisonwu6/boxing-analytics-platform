export type UploadFileType = "csv" | "mov";

export interface CreateUploadSessionResponse {
  id: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PresignRequest {
  fileType: UploadFileType;
  fileName: string;
  contentType: string;
}

export interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

export interface CompleteUploadRequest {
  fileType: UploadFileType;
  objectKey: string;
}

export interface UploadSessionItem {
  id: string;
  status?: string;
  csvObjectKey?: string | null;
  movObjectKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}