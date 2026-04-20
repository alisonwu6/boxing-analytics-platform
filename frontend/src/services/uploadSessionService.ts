import apiClient from "./apiClient";
import type {
  CompleteUploadRequest,
  CreateUploadSessionResponse,
  PresignRequest,
  PresignResponse,
  UploadSessionItem,
} from "../types/upload";

export const uploadSessionService = {
  async createUploadSession(): Promise<CreateUploadSessionResponse> {
    const response = await apiClient.post<CreateUploadSessionResponse>(
      "/upload-sessions"
    );
    return response.data;
  },

  async getUploadSessions(): Promise<UploadSessionItem[]> {
    const response = await apiClient.get<UploadSessionItem[]>("/sessions");
    return response.data;
  },

  async getUploadSessionById(id: string): Promise<UploadSessionItem> {
    const response = await apiClient.get<UploadSessionItem>(`/sessions/${id}`);
    return response.data;
  },

  async createPresignedUrl(
    sessionId: string,
    payload: PresignRequest
  ): Promise<PresignResponse> {
    const response = await apiClient.post<PresignResponse>(
      `/upload-sessions/${sessionId}/presign`,
      payload
    );
    return response.data;
  },

  async uploadFileToStorage(uploadUrl: string, file: File): Promise<void> {
    await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });
  },

  async completeUpload(
    sessionId: string,
    payload: CompleteUploadRequest
  ): Promise<void> {
    await apiClient.post(`/upload-sessions/${sessionId}/complete`, payload);
  },
};