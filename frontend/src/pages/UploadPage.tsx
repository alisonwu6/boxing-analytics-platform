import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Home,
  Upload,
  FileText,
  Video,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  Pencil,
  PlayCircle,
  Eye,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type FileType = "csv" | "mov";

type UploadStep =
  | "idle"
  | "creating-presign"
  | "uploading-s3"
  | "completing"
  | "completed"
  | "failed";

type Session = {
  id: string;
  title?: string;
  notes?: string;
  sessionType?: string;

  status?: string;
  processingStatus?: string;

  csvUploadStatus?: string;
  movUploadStatus?: string;

  sessionDate?: string;
  sessionStartAt?: string;
  createdAt?: string;
  updatedAt?: string;

  [key: string]: any;
};

export default function UploadPage() {
  const navigate = useNavigate();
  const params = useParams();

  const sessionId = params.sessionId || params.id || "";

  const [session, setSession] = useState<Session | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [movFile, setMovFile] = useState<File | null>(null);

  const [csvStep, setCsvStep] = useState<UploadStep>("idle");
  const [movStep, setMovStep] = useState<UploadStep>("idle");

  const [pageLoading, setPageLoading] = useState(true);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  const getFileContentType = (file: File, fileType: FileType) => {
    if (file.type) return file.type;

    if (fileType === "csv") return "text/csv";
    if (fileType === "mov") return "video/quicktime";

    return "application/octet-stream";
  };

  const extractUploadUrl = (data: any) => {
    return (
      data?.uploadUrl ||
      data?.url ||
      data?.presignedUrl ||
      data?.signedUrl ||
      data?.data?.uploadUrl ||
      data?.data?.url ||
      data?.data?.presignedUrl ||
      data?.upload?.uploadUrl ||
      ""
    );
  };

  const extractObjectKey = (data: any) => {
    return (
      data?.objectKey ||
      data?.key ||
      data?.s3Key ||
      data?.fileKey ||
      data?.data?.objectKey ||
      data?.data?.key ||
      data?.data?.s3Key ||
      data?.upload?.objectKey ||
      data?.upload?.key ||
      ""
    );
  };

  const extractReturnedContentType = (
    data: any,
    fallbackContentType: string
  ) => {
    return (
      data?.contentType ||
      data?.mimeType ||
      data?.data?.contentType ||
      data?.data?.mimeType ||
      data?.upload?.contentType ||
      fallbackContentType
    );
  };

  const loadSession = async () => {
    if (!sessionId) {
      setError("No session ID found in URL.");
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);
      setError("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
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
        throw new Error(`Failed to load session: ${res.status} ${text}`);
      }

      const data = await res.json();

      console.log("Session detail response:", data);

      const sessionData = data?.data || data?.session || data;

      setSession(sessionData);
      setTitleInput(sessionData?.title || "");
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load session.");
      }
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const saveTitle = async () => {
    if (!sessionId) return;

    const nextTitle = titleInput.trim();

    if (!nextTitle) {
      setError("Session name cannot be empty.");
      return;
    }

    try {
      setSavingTitle(true);
      setError("");
      setMessage("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: nextTitle,
        }),
      });

      if (!res.ok) {
        const text = await readErrorText(res);
        throw new Error(`Update session name failed: ${res.status} ${text}`);
      }

      setMessage("Session name updated.");
      setEditingTitle(false);

      await loadSession();
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not update session name.");
      }
    } finally {
      setSavingTitle(false);
    }
  };

  const createPresignedUrl = async (
    file: File,
    fileType: FileType
  ) => {
    const contentType = getFileContentType(file, fileType);

    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/presign`, {
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

    if (res.status === 401) {
      throw new Error("Unauthorized. Please login again.");
    }

    if (!res.ok) {
      const text = await readErrorText(res);
      throw new Error(`Create presigned URL failed: ${res.status} ${text}`);
    }

    const data = await res.json();

    console.log(`${fileType} presign response:`, data);

    return data;
  };

  const uploadToS3 = async (
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
      const text = await readErrorText(res);
      console.error("S3 PUT failed:", res.status, text);

      throw new Error(
        `S3 upload failed before complete. Status: ${res.status}. ${text}`
      );
    }
  };

  const completeUpload = async (
    fileType: FileType,
    objectKey: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
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

    if (res.status === 401) {
      throw new Error("Unauthorized. Please login again.");
    }

    if (!res.ok) {
      const text = await readErrorText(res);
      throw new Error(`Complete upload failed: ${res.status} ${text}`);
    }

    const data = await res.json().catch(() => null);

    console.log(`${fileType} complete response:`, data);

    return data;
  };

  const uploadFileForSession = async (file: File, fileType: FileType) => {
    const setStep = fileType === "csv" ? setCsvStep : setMovStep;

    try {
      setError("");
      setMessage("");

      if (!sessionId) {
        throw new Error("No session ID found.");
      }

      setStep("creating-presign");

      const presignData = await createPresignedUrl(file, fileType);

      const uploadUrl = extractUploadUrl(presignData);
      const objectKey = extractObjectKey(presignData);

      const fallbackContentType = getFileContentType(file, fileType);
      const returnedContentType = extractReturnedContentType(
        presignData,
        fallbackContentType
      );

      if (!uploadUrl) {
        throw new Error("Backend did not return uploadUrl.");
      }

      if (!objectKey) {
        throw new Error(
          "Backend did not return objectKey/key. Complete upload requires the same object key."
        );
      }

      console.log(`${fileType} uploadUrl:`, uploadUrl);
      console.log(`${fileType} objectKey:`, objectKey);
      console.log(`${fileType} contentType:`, returnedContentType);

      setStep("uploading-s3");

      await uploadToS3(uploadUrl, file, returnedContentType);

      setStep("completing");

      await completeUpload(fileType, objectKey);

      setStep("completed");

      setMessage(
        `${fileType.toUpperCase()} uploaded successfully. Session status will refresh now.`
      );

      await loadSession();
    } catch (err) {
      console.error(err);
      setStep("failed");

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`${fileType.toUpperCase()} upload failed.`);
      }
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      setError("Please choose a CSV file first.");
      return;
    }

    if (!csvFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid .csv file.");
      return;
    }

    await uploadFileForSession(csvFile, "csv");
  };

  const handleMovUpload = async () => {
    if (!movFile) {
      setError("Please choose a MOV file first.");
      return;
    }

    const lowerName = movFile.name.toLowerCase();

    if (!lowerName.endsWith(".mov") && !lowerName.endsWith(".mp4")) {
      setError("Please upload a valid .mov or .mp4 video file.");
      return;
    }

    await uploadFileForSession(movFile, "mov");
  };

  const getSessionStatus = () => {
    return session?.status || "draft";
  };

  const getProcessingStatus = () => {
    return session?.processingStatus || "idle";
  };

  const hasCsv = () => {
    return session?.csvUploadStatus === "uploaded";
  };

  const hasMov = () => {
    return session?.movUploadStatus === "uploaded";
  };

  const hasAnyUploadedFile = () => {
    return hasCsv() || hasMov();
  };

  const canAnalyze = () => {
    return getSessionStatus() === "ready" && hasAnyUploadedFile();
  };

  const isProcessing = () => {
    const status = getSessionStatus();
    const processingStatus = getProcessingStatus();

    return (
      status === "processing" ||
      processingStatus === "queued" ||
      processingStatus === "processing"
    );
  };

  const isCompleted = () => {
    return (
      getSessionStatus() === "completed" ||
      getProcessingStatus() === "completed"
    );
  };

  const handleAnalyze = async () => {
    if (!sessionId) return;

    try {
      setAnalyzeLoading(true);
      setError("");
      setMessage("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/analyze`, {
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

      await loadSession();

      navigate(`/insights/${sessionId}`);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not start analysis.");
      }
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const getStepText = (step: UploadStep) => {
    if (step === "creating-presign") return "Creating S3 upload URL...";
    if (step === "uploading-s3") return "Uploading to S3...";
    if (step === "completing") return "Completing upload...";
    if (step === "completed") return "Uploaded";
    if (step === "failed") return "Failed";
    return "";
  };

  const formatDate = (value?: string) => {
    if (!value) return "N/A";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleString();
  };

  const statusClass = (status?: string) => {
    const lower = (status || "").toLowerCase();

    if (lower === "completed" || lower === "complete") {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (lower === "ready" || lower === "uploaded") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (lower === "processing" || lower === "queued") {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    if (lower === "failed" || lower === "error") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-purple-100 text-purple-700 border-purple-200";
  };

  const uploadDisabled = isProcessing() || isCompleted();

  const isCsvBusy =
    csvStep === "creating-presign" ||
    csvStep === "uploading-s3" ||
    csvStep === "completing";

  const isMovBusy =
    movStep === "creating-presign" ||
    movStep === "uploading-s3" ||
    movStep === "completing";

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <RefreshCw className="mx-auto mb-4 animate-spin text-purple-600" />
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-6xl rounded-[28px] bg-white px-8 py-10 shadow-sm">
        <div className="relative mb-10 text-center">
          <button
            onClick={() => navigate("/sessions")}
            className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
            aria-label="Back to sessions"
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
            Session Upload
          </h1>

          <p className="mt-4 text-lg text-gray-500">
            Upload CSV, MOV, or both into the selected session.
          </p>
        </div>

        {message && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-green-700">
            <CheckCircle size={20} />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <div className="mb-8 rounded-3xl border border-purple-100 bg-purple-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-500">Session</p>

              {editingTitle ? (
                <div className="mt-2 flex flex-col gap-3 md:flex-row">
                  <input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-purple-400"
                  />

                  <button
                    onClick={saveTitle}
                    disabled={savingTitle}
                    className="rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingTitle ? "Saving..." : "Save"}
                  </button>

                  <button
                    onClick={() => {
                      setEditingTitle(false);
                      setTitleInput(session?.title || "");
                    }}
                    className="rounded-2xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="break-all text-2xl font-bold text-purple-600">
                    {session?.title || `Session ${sessionId.slice(0, 8)}`}
                  </h2>

                  <button
                    onClick={() => setEditingTitle(true)}
                    className="flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-purple-600 transition hover:bg-purple-50"
                  >
                    <Pencil size={15} />
                    Rename
                  </button>
                </div>
              )}

              <p className="mt-2 break-all text-sm text-gray-500">
                ID: {sessionId}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[360px]">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-gray-500">Status</p>
                <span
                  className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(
                    getSessionStatus()
                  )}`}
                >
                  {getSessionStatus()}
                </span>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-gray-500">
                  ML Status
                </p>
                <span
                  className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(
                    getProcessingStatus()
                  )}`}
                >
                  {getProcessingStatus()}
                </span>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-gray-500">CSV</p>
                <p
                  className={`mt-2 font-bold ${
                    hasCsv() ? "text-green-600" : "text-gray-500"
                  }`}
                >
                  {hasCsv() ? "Uploaded" : "Not uploaded"}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-gray-500">MOV</p>
                <p
                  className={`mt-2 font-bold ${
                    hasMov() ? "text-green-600" : "text-gray-500"
                  }`}
                >
                  {hasMov() ? "Uploaded" : "Not uploaded"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4">
              <p className="text-sm font-semibold text-gray-500">Created</p>
              <p className="mt-1 text-gray-700">
                {formatDate(
                  session?.sessionDate ||
                    session?.sessionStartAt ||
                    session?.createdAt
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4">
              <p className="text-sm font-semibold text-gray-500">Ready rule</p>
              <p className="mt-1 text-gray-700">
                At least one file uploaded + backend status ready
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4">
              <p className="text-sm font-semibold text-gray-500">
                Analysis button
              </p>
              <p className="mt-1 text-gray-700">
                {canAnalyze()
                  ? "Enabled"
                  : isCompleted()
                  ? "Completed"
                  : isProcessing()
                  ? "Processing"
                  : "Disabled until ready"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <FileText className="text-purple-600" size={26} />
              <h2 className="text-2xl font-bold text-purple-600">CSV File</h2>
            </div>

            <p className="mb-5 text-gray-600">
              Upload a CSV file into this session. CSV can be uploaded alone or
              together with MOV.
            </p>

            <label className="block">
              <span className="text-sm font-semibold text-gray-500">
                Choose CSV File
              </span>

              <input
                type="file"
                accept=".csv,text/csv"
                disabled={uploadDisabled || isCsvBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setCsvFile(file);
                  setCsvStep("idle");
                  setError("");
                  setMessage("");
                }}
                className="mt-2 block w-full cursor-pointer rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-purple-100 file:px-4 file:py-2 file:font-semibold file:text-purple-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            {csvFile && (
              <p className="mt-4 break-all text-sm text-gray-600">
                {csvFile.name}
              </p>
            )}

            {csvStep !== "idle" && (
              <p className="mt-3 text-sm font-semibold text-gray-500">
                {getStepText(csvStep)}
              </p>
            )}

            <button
              onClick={handleCsvUpload}
              disabled={!csvFile || isCsvBusy || uploadDisabled}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
            >
              {isCsvBusy ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Uploading CSV...
                </>
              ) : hasCsv() ? (
                <>
                  <CheckCircle size={18} />
                  Re-upload CSV
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload CSV
                </>
              )}
            </button>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Video className="text-purple-600" size={26} />
              <h2 className="text-2xl font-bold text-purple-600">MOV File</h2>
            </div>

            <p className="mb-5 text-gray-600">
              Upload a MOV or MP4 video file. The analysed annotated video will
              be shown in Insights after processing.
            </p>

            <label className="block">
              <span className="text-sm font-semibold text-gray-500">
                Choose MOV File
              </span>

              <input
                type="file"
                accept=".mov,.mp4,video/quicktime,video/mp4"
                disabled={uploadDisabled || isMovBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setMovFile(file);
                  setMovStep("idle");
                  setError("");
                  setMessage("");
                }}
                className="mt-2 block w-full cursor-pointer rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-purple-100 file:px-4 file:py-2 file:font-semibold file:text-purple-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            {movFile && (
              <p className="mt-4 break-all text-sm text-gray-600">
                {movFile.name}
              </p>
            )}

            {movStep !== "idle" && (
              <p className="mt-3 text-sm font-semibold text-gray-500">
                {getStepText(movStep)}
              </p>
            )}

            <button
              onClick={handleMovUpload}
              disabled={!movFile || isMovBusy || uploadDisabled}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
            >
              {isMovBusy ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Uploading MOV...
                </>
              ) : hasMov() ? (
                <>
                  <CheckCircle size={18} />
                  Re-upload MOV
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload MOV
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-gray-100 bg-gray-50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Activity className="text-purple-600" size={26} />
            <h2 className="text-2xl font-bold text-purple-600">
              Analysis Control
            </h2>
          </div>

          <p className="text-gray-600">
            Analysis is only enabled after the backend confirms the upload and
            returns session status as ready.
          </p>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            {isCompleted() ? (
              <button
                onClick={() => navigate(`/insights/${sessionId}`)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
              >
                <Eye size={18} />
                View Insights
              </button>
            ) : isProcessing() ? (
              <button
                disabled
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-yellow-100 px-6 py-3 font-semibold text-yellow-700"
              >
                <RefreshCw size={18} className="animate-spin" />
                Processing...
              </button>
            ) : canAnalyze() ? (
              <button
                onClick={handleAnalyze}
                disabled={analyzeLoading}
                className="flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzeLoading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Starting analysis...
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
                disabled
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-gray-200 px-6 py-3 font-semibold text-gray-500"
              >
                Upload a file first
              </button>
            )}

            <button
              onClick={loadSession}
              className="flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-white px-6 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
            >
              <RefreshCw size={18} />
              Refresh Status
            </button>

            <button
              onClick={() => navigate("/sessions")}
              className="rounded-2xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Back to Sessions
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-5 text-sm text-purple-700">
          <p className="font-semibold">Current flow</p>
          <p className="mt-1">
            Create session → open session upload page → upload CSV or MOV →
            complete upload with objectKey → backend updates status to ready →
            Analyze button becomes enabled → status changes to processing after
            analysis starts.
          </p>
        </div>
      </div>
    </div>
  );
}