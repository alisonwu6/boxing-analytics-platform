import api from "./api";

export async function fetchSessions() {
  const response = await api.get("/sessions");
  return response.data;
}

export async function fetchSessionById(id: string) {
  const response = await api.get(`/sessions/${id}`);
  return response.data;
}

export async function analyzeSession(id: string) {
  const response = await api.post(`/sessions/${id}/analyze`);
  return response.data;
}

export async function fetchSessionStatus(id: string) {
  const response = await api.get(`/sessions/${id}/status`);
  return response.data;
}

export async function fetchSessionResults(id: string) {
  const response = await api.get(`/sessions/${id}/results`);
  return response.data;
}

export async function uploadSessionFiles(
  csvFile?: File | null,
  movFile?: File | null
) {
  const formData = new FormData();

  if (csvFile) {
    formData.append("csvFile", csvFile);
  }

  if (movFile) {
    formData.append("movFile", movFile);
  }

  const response = await api.post("/sessions/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}