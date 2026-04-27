export type UploadFileType = "csv" | "mov";

export interface CreateUploadSessionResponse {
  id: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PresignRequest {
  fileType: UploadFileType;
  originalFileName: string;
  contentType: string;
}

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  bucket?: string;
  region?: string;
  expiresIn?: number;
  uploadSessionId?: string;
  fileType?: UploadFileType;
}

export interface CompleteUploadRequest {
  fileType: UploadFileType;
  key: string;
}

export interface UploadSessionItem {
  id: string;
  status?: string;
  csvObjectKey?: string | null;
  movObjectKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}