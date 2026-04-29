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
  Activity,
  Plus,
  UploadCloud,
  Eye,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type Session = {
  id: string;
  userId?: string;

  title?: string;
  notes?: string;
  sessionType?: string;

  status?: string;
  processingStatus?: string;

  csvUploadStatus?: string;
  movUploadStatus?: string;

  sessionDate?: string;
  sessionStartAt?: string;
  sessionEndAt?: string;
  createdAt?: string;
  updatedAt?: string;

  [key: string]: any;
};

export default function SessionsPage() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

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

  const readErrorText = async (res: Response) => {
    try {
      const text = await res.text();
      return text || res.statusText;
    } catch {
      return res.statusText;
    }
  };

  const extractSessionId = (data: any) => {
    return (
      data?.id ||
      data?.sessionId ||
      data?.uploadSessionId ||
      data?.session?.id ||
      data?.data?.id ||
      data?.data?.session?.id ||
      ""
    );
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE_URL}/sessions`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        throw new Error(`Failed to fetch sessions: ${res.status} ${text}`);
      }

      const data = await res.json();

      console.log("Sessions from backend:", data);

      const sessionList: Session[] = Array.isArray(data)
        ? data
        : Array.isArray(data.sessions)
        ? data.sessions
        : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.items)
        ? data.items
        : [];

      setSessions(sessionList);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load sessions.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const createSession = async () => {
    try {
      setCreating(true);
      setError("");

      const title = newTitle.trim() || "Untitled Boxing Session";
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      const res = await fetch(`${API_BASE_URL}/upload-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title,
          notes: newNotes.trim(),
          sessionType: "training",
          sessionDate: start.toISOString(),
          sessionStartAt: start.toISOString(),
          sessionEndAt: end.toISOString(),
        }),
      });

      if (res.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        throw new Error(`Create session failed: ${res.status} ${text}`);
      }

      const data = await res.json();

      console.log("Create upload session response:", data);

      const sessionId = extractSessionId(data);

      if (!sessionId) {
        throw new Error("Backend did not return session id.");
      }

      setCreateOpen(false);
      setNewTitle("");
      setNewNotes("");

      navigate(`/sessions/${sessionId}/upload`);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not create session.");
      }
    } finally {
      setCreating(false);
    }
  };

  const getShortId = (id: string) => {
    if (!id) return "N/A";
    return id.slice(0, 8);
  };

  const getSessionStatus = (session: Session) => {
    return session.status || "draft";
  };

  const getProcessingStatus = (session: Session) => {
    return session.processingStatus || "idle";
  };

  const hasCsv = (session: Session) => {
    return session.csvUploadStatus === "uploaded";
  };

  const hasMov = (session: Session) => {
    return session.movUploadStatus === "uploaded";
  };

  const hasAnyUploadedFile = (session: Session) => {
    return hasCsv(session) || hasMov(session);
  };

  const canAnalyze = (session: Session) => {
    return getSessionStatus(session) === "ready" && hasAnyUploadedFile(session);
  };

  const isProcessing = (session: Session) => {
    const status = getSessionStatus(session);
    const processingStatus = getProcessingStatus(session);

    return (
      status === "processing" ||
      processingStatus === "queued" ||
      processingStatus === "preprocessing" ||
      processingStatus === "inferencing" ||
      processingStatus === "processing"
    );
  };

  const isCompleted = (session: Session) => {
    return (
      getSessionStatus(session) === "completed" ||
      getProcessingStatus(session) === "completed"
    );
  };

  const getCsvText = (session: Session) => {
    return hasCsv(session) ? "Uploaded" : "Missing";
  };

  const getMovText = (session: Session) => {
    return hasMov(session) ? "Uploaded" : "Missing";
  };

  const formatDate = (session: Session) => {
    const rawDate =
      session.sessionDate ||
      session.sessionStartAt ||
      session.createdAt ||
      session.updatedAt;

    if (!rawDate) return "N/A";

    const date = new Date(rawDate);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleString();
  };

  const filteredSessions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    if (!term) return sessions;

    return sessions.filter((session) => {
      const title = session.title || "";
      const id = session.id || "";
      const sessionStatus = getSessionStatus(session);
      const processingStatus = getProcessingStatus(session);
      const csvStatus = session.csvUploadStatus || "";
      const movStatus = session.movUploadStatus || "";

      return (
        title.toLowerCase().includes(term) ||
        id.toLowerCase().includes(term) ||
        sessionStatus.toLowerCase().includes(term) ||
        processingStatus.toLowerCase().includes(term) ||
        csvStatus.toLowerCase().includes(term) ||
        movStatus.toLowerCase().includes(term)
      );
    });
  }, [sessions, searchTerm]);

  const handleAnalyze = async (session: Session) => {
    try {
      setActionLoadingId(session.id);
      setError("");

      const res = await fetch(`${API_BASE_URL}/sessions/${session.id}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        throw new Error(`Could not start analysis: ${res.status} ${text}`);
      }

      navigate(`/insights/${session.id}`);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not start analysis.");
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const statusClass = (status: string) => {
    const lower = status.toLowerCase();

    if (lower === "completed" || lower === "complete") {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (lower === "ready" || lower === "uploaded") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (
      lower === "processing" ||
      lower === "queued" ||
      lower === "preprocessing" ||
      lower === "inferencing"
    ) {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    if (lower === "failed" || lower === "error") {
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
            onClick={() => navigate("/home")}
            className="absolute right-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
            aria-label="Go home"
          >
            <Home size={22} />
          </button>

          <h1 className="text-5xl font-extrabold text-purple-600">
            Sessions
          </h1>

          <p className="mt-4 text-lg text-gray-500">
            Create a session first, then upload CSV or MOV files into that
            session.
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
              placeholder="Search sessions, status, or ID..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-gray-700 outline-none transition focus:border-purple-400 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchSessions}
              className="flex items-center gap-2 rounded-2xl border border-purple-200 bg-white px-5 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
            >
              <RefreshCw size={18} />
              Refresh
            </button>

            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
            >
              <Plus size={18} />
              Create Session
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            <AlertCircle size={20} />
            <span className="break-words">{error}</span>
          </div>
        )}

        {createOpen && (
          <div className="mb-8 rounded-3xl border border-purple-100 bg-purple-50 p-6">
            <h2 className="text-2xl font-bold text-purple-600">
              Create New Session
            </h2>

            <p className="mt-2 text-gray-600">
              Create a session first. After creation, you can upload CSV, MOV,
              or both files into this session.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Session name
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. JackBag Test Session"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Notes
                </label>
                <input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-purple-400"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={createSession}
                disabled={creating}
                className="flex items-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    Create and Upload
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setCreateOpen(false);
                  setNewTitle("");
                  setNewNotes("");
                }}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
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
                No sessions found
              </p>

              <p className="mt-2 text-gray-500">
                Create a session first, then upload boxing files into it.
              </p>

              <button
                onClick={() => setCreateOpen(true)}
                className="mt-6 rounded-2xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
              >
                Create Session
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredSessions.map((session) => {
              const sessionStatus = getSessionStatus(session);
              const processingStatus = getProcessingStatus(session);
              const csvText = getCsvText(session);
              const movText = getMovText(session);
              const busy = actionLoadingId === session.id;

              return (
                <div
                  key={session.id}
                  className="rounded-3xl border border-gray-100 bg-gray-50 p-6 shadow-sm transition hover:-translate-y-1 hover:bg-white hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-purple-600">
                        {session.title || `Session ${getShortId(session.id)}`}
                      </h2>

                      <p className="mt-1 text-sm text-gray-400">
                        ID: {getShortId(session.id)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                        sessionStatus
                      )}`}
                    >
                      {sessionStatus}
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

                    <div className="flex items-start gap-3">
                      <Activity size={18} className="text-gray-400" />

                      <div>
                        <p className="font-semibold">ML Status</p>
                        <p className="break-all text-gray-500">
                          {processingStatus}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold">Created</p>
                      <p className="text-gray-500">{formatDate(session)}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3">
                    {isCompleted(session) ? (
                      <button
                        onClick={() => navigate(`/insights/${session.id}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
                      >
                        <Eye size={18} />
                        View Insights
                      </button>
                    ) : isProcessing(session) ? (
                      <button
                        disabled
                        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-yellow-100 px-5 py-3 font-semibold text-yellow-700"
                      >
                        <RefreshCw size={18} className="animate-spin" />
                        Processing...
                      </button>
                    ) : canAnalyze(session) ? (
                      <button
                        onClick={() => handleAnalyze(session)}
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <PlayCircle size={18} />
                            Analyze Session
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          navigate(`/sessions/${session.id}/upload`)
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
                      >
                        <UploadCloud size={18} />
                        Open Upload
                      </button>
                    )}

                    <button
                      onClick={() => navigate(`/sessions/${session.id}/upload`)}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-white px-4 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
                    >
                      <UploadCloud size={17} />
                      Manage Files
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}