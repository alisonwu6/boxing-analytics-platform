import api from "./api";

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  name: string;
};

export async function loginUser(payload: LoginPayload) {
  const response = await api.post("/auth/login", payload);
  return response.data;
}

export async function registerUser(payload: RegisterPayload) {
  const response = await api.post("/auth/register", payload);
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get("/auth/me");
  return response.data;
}