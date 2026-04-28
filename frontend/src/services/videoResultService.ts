const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

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

export const getAnnotatedVideoUrl = async (sessionId: string) => {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/results/video`, {
    method: "GET",
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized. Please login again.");
  }

  if (res.status === 404) {
    throw new Error("Annotated video is not ready yet.");
  }

  if (!res.ok) {
    throw new Error(`Failed to get annotated video: ${res.status}`);
  }

  const data = await res.json();

  console.log("Annotated video response:", data);

  return (
    data.videoUrl ||
    data.url ||
    data.presignedUrl ||
    data.signedUrl ||
    data.annotatedVideoUrl
  );
};