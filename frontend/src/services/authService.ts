import apiClient from "./apiClient";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "../types/auth";
import { storage } from "../utils/storage";

export const authService = {
  async login(payload: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);

    if (response.data.token) {
      storage.setToken(response.data.token);
    }

    return response.data;
  },

  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(
      "/auth/register",
      payload
    );

    if (response.data.token) {
      storage.setToken(response.data.token);
    }

    return response.data;
  },

  logout() {
    storage.clearToken();
  },
};

export const getCurrentUser = async (): Promise<any> => {
  const response = await apiClient.get("/auth/me");
  return response.data;
};