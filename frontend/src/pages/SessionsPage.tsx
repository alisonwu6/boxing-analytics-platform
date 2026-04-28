import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Home,
  FileText,
  Video,
  RefreshCw,
  Search,
  PlayCircle,
  AlertCircle,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type UploadedFile = {
  fieldName?: string;
  originalName?: string;
  fileName?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  storedName?: string;
  relativePath?: string;
  key?: string;
  objectKey?: string;
  s3Key?: string;
  url?: string;
  status?: string;
  uploaded?: boolean;
};

type Session = {
  id: string;
  userId?: string;

  title?: string;
  notes?: string;
  sessionType?: string;

  status?: string;
  processingStatus?: string;
  uploadStatus?: string;

  sessionDate?: string;
  sessionStartAt?: string;
  sessionEndAt?: string;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;

  csvFile?: UploadedFile | null;
  movFile?: UploadedFile | null;

  csvUploaded?: boolean;
  movUploaded?: boolean;

  csvFileName?: string;
  movFileName?: string;

  csvOriginalName?: string;
  movOriginalName?: string;

  csvKey?: string;
  movKey?: string;

  csvObjectKey?: string;
  movObjectKey?: string;

  csvS3Key?: string;
  movS3Key?: string;

  files?: {
    csv?: UploadedFile;
    mov?: UploadedFile;
    video?: UploadedFile;
  } | UploadedFile[];

  [key: string]: any;
};

export default function SessionsPage() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const getFileNameFromKey = (key?: string | null) => {
    if (!key) return "";

    try {
      const cleanKey = key.split("?")[0];
      const parts = cleanKey.split("/");
      return decodeURIComponent(parts[parts.length - 1] || cleanKey);
    } catch {
      return key;
    }
  };

  const getFileFromArray = (
    files: UploadedFile[] | undefined,
    fileType: "csv" | "mov"
  ) => {
    if (!files || !Array.isArray(files)) return undefined;

    return files.find((file) => {
      const field = (file.fieldName || "").toLowerCase();
      const mime = (file.mimeType || "").toLowerCase();
      const name = (
        file.originalName ||
        file.fileName ||
        file.name ||
        file.storedName ||
        file.key ||
        file.objectKey ||
        file.s3Key ||
        ""
      ).toLowerCase();

      if (fileType === "csv") {
        return (
          field.includes("csv") ||
          mime.includes("csv") ||
          name.endsWith(".csv")
        );
      }

      return (
        field.includes("mov") ||
        field.includes("video") ||
        mime.includes("quicktime") ||
        mime.includes("video") ||
        name.endsWith(".mov") ||
        name.endsWith(".mp4")
      );
    });
  };

  const getNestedFile = (session: Session, fileType: "csv" | "mov") => {
    if (fileType === "csv") {
      if (session.csvFile) return session.csvFile;

      if (Array.isArray(session.files)) {
        return getFileFromArray(session.files, "csv");
      }

      return session.files?.csv;
    }

    if (session.movFile) return session.movFile;

    if (Array.isArray(session.files)) {
      return getFileFromArray(session.files, "mov");
    }

    return session.files?.mov || session.files?.video;
  };

  const getCsvText = (session: Session) => {
    const file = getNestedFile(session, "csv");

    const name =
      file?.originalName ||
      file?.fileName ||
      file?.name ||
      session.csvOriginalName ||
      session.csvFileName;

    if (name) return name;

    const key =
      file?.key ||
      file?.objectKey ||
      file?.s3Key ||
      file?.storedName ||
      session.csvKey ||
      session.csvObjectKey ||
      session.csvS3Key;

    if (key) return getFileNameFromKey(key) || "Uploaded";

    if (session.csvUploaded || file?.uploaded) return "Uploaded";

    return "Not uploaded";
  };

  const getMovText = (session: Session) => {
    const file = getNestedFile(session, "mov");

    const name =
      file?.originalName ||
      file?.fileName ||
      file?.name ||
      session.movOriginalName ||
      session.movFileName;

    if (name) return name;

    const key =
      file?.key ||
      file?.objectKey ||
      file?.s3Key ||
      file?.storedName ||
      session.movKey ||
      session.movObjectKey ||
      session.movS3Key;

    if (key) return getFileNameFromKey(key) || "Uploaded";

    if (session.movUploaded || file?.uploaded) return "Uploaded";

    return "Not uploaded";
  };

  const hasCsv = (session: Session) => {
    return getCsvText(session) !== "Not uploaded";
  };

  const hasMov = (session: Session) => {
    return getMovText(session) !== "Not uploaded";
  };

  const getStatus = (session: Session) => {
    return (
      session.processingStatus ||
      session.uploadStatus ||
      session.status ||
      (hasCsv(session) || hasMov(session) ? "uploaded" : "idle")
    );
  };

  const formatDate = (session: Session) => {
    const rawDate =
      session.sessionDate ||
      session.sessionStartAt ||
      session.createdAt ||
      session.created_at ||
      session.updatedAt ||
      session.updated_at;

    if (!rawDate) return "N/A";

    const date = new Date(rawDate);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleString();
  };

  const getShortId = (id: string) => {
    if (!id) return "N/A";
    return id.slice(0, 8);
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE_URL}/upload-sessions`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        throw new Error(
          "Unauthorized. Please login again or check your token in localStorage."
        );
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch upload sessions: ${res.status}`);
      }

      const data = await res.json();

      console.log("Upload sessions from backend:", data);

      const sessionList: Session[] = Array.isArray(data)
        ? data
        : Array.isArray(data.sessions)
        ? data.sessions
        : Array.isArray(data.uploadSessions)
        ? data.uploadSessions
        : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.data)
        ? data.data
        : [];

      setSessions(sessionList);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load upload sessions.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const filteredSessions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    if (!term) return sessions;

    return sessions.filter((session) => {
      const title = session.title || "";
      const id = session.id || "";
      const csvName = getCsvText(session);
      const movName = getMovText(session);
      const status = getStatus(session);

      return (
        title.toLowerCase().includes(term) ||
        id.toLowerCase().includes(term) ||
        csvName.toLowerCase().includes(term) ||
        movName.toLowerCase().includes(term) ||
        status.toLowerCase().includes(term)
      );
    });
  }, [sessions, searchTerm]);

  const handleAnalyze = async (session: Session) => {
    try {
      setAnalyzingId(session.id);
      setError("");

      const res = await fetch(
        `${API_BASE_URL}/upload-sessions/${session.id}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
        }
      );

      if (!res.ok) {
        console.warn("Analyze endpoint failed or not ready:", res.status);
      }

      navigate(`/insights/${session.id}`);
    } catch (err) {
      console.error(err);

      navigate(`/insights/${session.id}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const statusClass = (status: string) => {
    const lower = status.toLowerCase();

    if (
      lower.includes("ready") ||
      lower.includes("uploaded") ||
      lower.includes("complete") ||
      lower.includes("completed")
    ) {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (
      lower.includes("processing") ||
      lower.includes("analyzing") ||
      lower.includes("pending")
    ) {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    if (lower.includes("failed") || lower.includes("error")) {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-purple-100 text-purple-700 border-purple-200";
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl rounded-[28px] bg-white px-8 py-10 shadow-sm">
        <div className="relative mb-10 text-center">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
            aria-label="Go back"
          >
            <ArrowLeft size={24} />
          </button>

          <button
            onClick={() => navigate("/")}
            className="absolute right-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
            aria-label="Go home"
          >
            <Home size={22} />
          </button>

          <h1 className="text-5xl font-extrabold text-purple-600">
            Sessions
          </h1>

          <p className="mt-4 text-lg text-gray-500">
            Select a saved boxing session for analysis
          </p>
        </div>

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sessions, files, or status..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-gray-700 outline-none transition focus:border-purple-400 focus:bg-white"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchSessions}
              className="flex items-center gap-2 rounded-2xl border border-purple-200 bg-white px-5 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
            >
              <RefreshCw size={18} />
              Refresh
            </button>

            <button
              onClick={() => navigate("/upload")}
              className="rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
            >
              Upload New
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <RefreshCw className="mx-auto mb-4 animate-spin text-purple-600" />
              <p className="text-gray-500">Loading sessions...</p>
            </div>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50">
            <div className="text-center">
              <p className="text-xl font-semibold text-gray-700">
                No upload sessions found
              </p>

              <p className="mt-2 text-gray-500">
                Upload a CSV or MOV file to create your first boxing session.
              </p>

              <button
                onClick={() => navigate("/upload")}
                className="mt-6 rounded-2xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
              >
                Go to Upload
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredSessions.map((session) => {
              const status = getStatus(session);
              const csvText = getCsvText(session);
              const movText = getMovText(session);

              return (
                <div
                  key={session.id}
                  className="rounded-3xl border border-gray-100 bg-gray-50 p-6 shadow-sm transition hover:-translate-y-1 hover:bg-white hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-purple-600">
                        {session.title || `Boxing Session Upload`}
                      </h2>

                      <p className="mt-1 text-sm text-gray-400">
                        ID: {getShortId(session.id)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="flex items-start gap-3">
                      <FileText
                        size={18}
                        className={
                          hasCsv(session) ? "text-green-600" : "text-gray-400"
                        }
                      />

                      <div>
                        <p className="font-semibold">CSV</p>
                        <p className="break-all text-gray-500">{csvText}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Video
                        size={18}
                        className={
                          hasMov(session) ? "text-green-600" : "text-gray-400"
                        }
                      />

                      <div>
                        <p className="font-semibold">MOV</p>
                        <p className="break-all text-gray-500">{movText}</p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold">Created</p>
                      <p className="text-gray-500">{formatDate(session)}</p>
                    </div>

                    {session.sessionType && (
                      <div>
                        <p className="font-semibold">Type</p>
                        <p className="text-gray-500">{session.sessionType}</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleAnalyze(session)}
                    disabled={analyzingId === session.id}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {analyzingId === session.id ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Preparing...
                      </>
                    ) : (
                      <>
                        <PlayCircle size={19} />
                        Analyze Session
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}