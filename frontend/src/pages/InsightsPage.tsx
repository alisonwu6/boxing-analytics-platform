import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Home,
  RefreshCw,
  Video,
  Activity,
  FileText,
  AlertCircle,
  CheckCircle,
  Dumbbell,
  Target,
  Zap,
  TrendingUp,
  PlayCircle,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type Session = {
  id: string;
  title?: string;
  sessionType?: string;

  status?: string;
  processingStatus?: string;

  csvUploadStatus?: string;
  movUploadStatus?: string;

  sessionDate?: string;
  sessionStartAt?: string;
  createdAt?: string;

  [key: string]: any;
};

type InsightResult = {
  totalPunches?: number | string;
  dominantPunch?: string;
  averageSpeed?: number | string;
  peakPower?: number | string;
  accuracyScore?: number | string;
  consistencyScore?: number | string;
  summary?: string;
  recommendations?: string[];
  [key: string]: any;
};

export default function InsightsPage() {
  const navigate = useNavigate();
  const params = useParams();

  const sessionId = params.sessionId || params.id;

  const [session, setSession] = useState<Session | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [insights, setInsights] = useState<InsightResult | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [insightError, setInsightError] = useState("");

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

  const formatDate = (value?: string) => {
    if (!value) return "N/A";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleString();
  };

  const statusClass = (status?: string) => {
    const value = (status || "").toLowerCase();

    if (value === "completed" || value === "complete") {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (value === "ready" || value === "uploaded") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (value === "processing" || value === "queued") {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    if (value === "failed" || value === "error") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-purple-100 text-purple-700 border-purple-200";
  };

  const getVideoUrlFromResponse = (data: any) => {
    return (
      data?.videoUrl ||
      data?.url ||
      data?.presignedUrl ||
      data?.signedUrl ||
      data?.annotatedVideoUrl ||
      data?.data?.videoUrl ||
      data?.data?.url ||
      data?.data?.presignedUrl ||
      ""
    );
  };

  const normaliseInsights = (data: any): InsightResult => {
    const source = data?.data || data?.result || data?.results || data || {};

    return {
      totalPunches:
        source.totalPunches ||
        source.total_punches ||
        source.metrics?.totalPunches ||
        source.summary?.totalPunches ||
        "N/A",

      dominantPunch:
        source.dominantPunch ||
        source.dominant_punch ||
        source.metrics?.dominantPunch ||
        source.summary?.dominantPunch ||
        "N/A",

      averageSpeed:
        source.averageSpeed ||
        source.average_speed ||
        source.metrics?.averageSpeed ||
        source.summary?.averageSpeed ||
        "N/A",

      peakPower:
        source.peakPower ||
        source.peak_power ||
        source.metrics?.peakPower ||
        source.summary?.peakPower ||
        "N/A",

      accuracyScore:
        source.accuracyScore ||
        source.accuracy_score ||
        source.metrics?.accuracyScore ||
        source.summary?.accuracyScore ||
        "N/A",

      consistencyScore:
        source.consistencyScore ||
        source.consistency_score ||
        source.metrics?.consistencyScore ||
        source.summary?.consistencyScore ||
        "N/A",

      summary:
        source.summaryText ||
        source.summary_text ||
        source.feedbackSummary ||
        source.feedback_summary ||
        source.summary ||
        "The analysis results are not fully available yet. Once ML processing is completed, this section will show the session summary, punch patterns, and improvement feedback.",

      recommendations:
        source.recommendations ||
        source.feedback ||
        source.suggestions ||
        [
          "Run the analysis first and wait until ML Status becomes completed.",
          "Refresh the video section after the annotated video has been generated.",
          "Use the annotated video to review punch timing, body rotation, and recovery movement.",
        ],
    };
  };

  const loadSession = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return;
      }

      if (!res.ok) {
        console.warn("Session detail endpoint failed:", res.status);
        return;
      }

      const data = await res.json();

      console.log("Session detail response:", data);

      setSession(data?.data || data?.session || data);
    } catch (err) {
      console.warn("Could not load session detail:", err);
    }
  };

  const loadAnnotatedVideo = async () => {
    if (!sessionId) return;

    try {
      setVideoLoading(true);
      setVideoError("");

      const res = await fetch(
        `${API_BASE_URL}/sessions/${sessionId}/results/video`,
        {
          method: "GET",
          headers: {
            ...getAuthHeaders(),
          },
        }
      );

      if (res.status === 404) {
        setVideoUrl("");
        setVideoError(
          "Annotated video is not ready yet. Run analysis first, then refresh after processing is completed."
        );
        return;
      }

      if (res.status === 409) {
        setVideoUrl("");
        setVideoError(
          "Analysis is still processing. The annotated video will be available after ML processing is completed."
        );
        return;
      }

      if (res.status === 401) {
        setVideoUrl("");
        setVideoError("Unauthorized. Please login again.");
        return;
      }

      if (!res.ok) {
        setVideoUrl("");
        setVideoError(`Failed to load annotated video: ${res.status}`);
        return;
      }

      const data = await res.json();

      console.log("Annotated video response:", data);

      const url = getVideoUrlFromResponse(data);

      if (!url) {
        setVideoUrl("");
        setVideoError("Backend did not return a video URL.");
        return;
      }

      setVideoUrl(url);
    } catch (err) {
      console.warn("Annotated video not ready:", err);
      setVideoUrl("");
      setVideoError("Could not load annotated video.");
    } finally {
      setVideoLoading(false);
    }
  };

  const loadInsights = async () => {
    if (!sessionId) return;

    try {
      setInsightLoading(true);
      setInsightError("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/results`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 404) {
        setInsightError("Insight results are not ready yet. Please run analysis first.");
        setInsights(normaliseInsights({}));
        return;
      }

      if (res.status === 409) {
        setInsightError(
          "Analysis is still processing. Results will appear after ML processing is completed."
        );
        setInsights(normaliseInsights({}));
        return;
      }

      if (res.status === 401) {
        setInsightError("Unauthorized. Please login again.");
        setInsights(normaliseInsights({}));
        return;
      }

      if (!res.ok) {
        setInsightError(`Failed to load insight results: ${res.status}`);
        setInsights(normaliseInsights({}));
        return;
      }

      const data = await res.json();

      console.log("Insight results response:", data);

      setInsights(normaliseInsights(data));
    } catch (err) {
      console.warn("Insight results not ready:", err);
      setInsightError("Could not load insight results.");
      setInsights(normaliseInsights({}));
    } finally {
      setInsightLoading(false);
    }
  };

  const loadPage = async () => {
    try {
      setPageLoading(true);
      setError("");

      await Promise.all([loadSession(), loadAnnotatedVideo(), loadInsights()]);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load insights page.");
      }
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleStartAnalysis = async () => {
    if (!sessionId) return;

    try {
      setAnalyzeLoading(true);
      setError("");
      setVideoError("");
      setInsightError("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return;
      }

      if (res.status === 409) {
        setError(
          "Analysis has already started or is still processing. Please wait and refresh the results."
        );
        return;
      }

      if (!res.ok) {
        setError(`Could not start analysis: ${res.status}`);
        return;
      }

      await loadSession();

      setInsightError(
        "Analysis has started. Please wait until ML Status becomes completed, then refresh results."
      );
    } catch (err) {
      console.error(err);
      setError("Could not start analysis.");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    await loadPage();
  };

  const metricCards = [
    {
      label: "Total Punches",
      value: insights?.totalPunches ?? "N/A",
      icon: Dumbbell,
    },
    {
      label: "Dominant Punch",
      value: insights?.dominantPunch ?? "N/A",
      icon: Target,
    },
    {
      label: "Average Speed",
      value: insights?.averageSpeed ?? "N/A",
      icon: Zap,
    },
    {
      label: "Peak Power",
      value: insights?.peakPower ?? "N/A",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl rounded-[28px] bg-white px-8 py-10 shadow-sm">
        {/* Header */}
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
            Session Insights
          </h1>

          <p className="mt-4 text-lg text-gray-500">
            Annotated video on top, boxing insights below
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* Session summary */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">Session</p>
            <p className="mt-2 break-all text-lg font-bold text-purple-600">
              {session?.title || `Session ${sessionId?.slice(0, 8) || ""}`}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">Session Status</p>
            <span
              className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(
                session?.status
              )}`}
            >
              {session?.status || "N/A"}
            </span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">ML Status</p>
            <span
              className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(
                session?.processingStatus
              )}`}
            >
              {session?.processingStatus || "N/A"}
            </span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">Created</p>
            <p className="mt-2 text-gray-700">
              {formatDate(
                session?.sessionDate || session?.sessionStartAt || session?.createdAt
              )}
            </p>
          </div>
        </div>

        {/* Top section: annotated video */}
        <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Video className="text-purple-600" size={26} />
                <h2 className="text-2xl font-bold text-purple-600">
                  Annotated Video
                </h2>
              </div>

              <p className="mt-2 text-gray-500">
                This area displays the processed boxing video after the backend
                generates annotated_video.mp4.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleStartAnalysis}
                disabled={analyzeLoading}
                className="flex items-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzeLoading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <PlayCircle size={18} />
                    Run Analysis
                  </>
                )}
              </button>

              <button
                onClick={handleRefreshAll}
                className="flex items-center gap-2 rounded-2xl border border-purple-200 bg-white px-5 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
              >
                <RefreshCw size={18} />
                Refresh Results
              </button>
            </div>
          </div>

          {videoLoading || pageLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl bg-white">
              <div className="text-center text-gray-500">
                <RefreshCw className="mx-auto mb-4 animate-spin text-purple-600" />
                Loading annotated video...
              </div>
            </div>
          ) : videoUrl ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black">
              <video src={videoUrl} controls className="h-auto w-full">
                Your browser does not support the video tag.
              </video>
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white">
              <div className="max-w-md text-center">
                <Video className="mx-auto mb-4 text-gray-400" size={48} />

                <p className="text-lg font-semibold text-gray-700">
                  Annotated video not available yet
                </p>

                <p className="mt-2 text-gray-500">
                  {videoError ||
                    "Run analysis first. After ML processing is completed, refresh this section to load the annotated video."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom section: insights */}
        <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Activity className="text-purple-600" size={26} />
              <div>
                <h2 className="text-2xl font-bold text-purple-600">
                  Performance Insights
                </h2>
                <p className="mt-1 text-gray-500">
                  Summary of punch performance and movement feedback.
                </p>
              </div>
            </div>

            {insightLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <RefreshCw size={16} className="animate-spin" />
                Loading insights...
              </div>
            )}
          </div>

          {insightError && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-yellow-700">
              <AlertCircle size={20} />
              <span>{insightError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            {metricCards.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
                >
                  <Icon className="mb-3 text-purple-600" size={24} />
                  <p className="text-sm font-semibold text-gray-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-800">
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="text-purple-600" size={22} />
                <h3 className="text-xl font-bold text-gray-800">
                  Analysis Summary
                </h3>
              </div>

              <p className="leading-7 text-gray-600">
                {insights?.summary ||
                  "No summary has been returned by the backend yet."}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle className="text-purple-600" size={22} />
                <h3 className="text-xl font-bold text-gray-800">
                  Improvement Recommendations
                </h3>
              </div>

              <div className="space-y-3">
                {(insights?.recommendations || []).map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-xl bg-white px-4 py-3 text-gray-600"
                  >
                    {index + 1}. {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-5 text-purple-700">
            <p className="font-semibold">Current flow</p>
            <p className="mt-1">
              Upload CSV and MOV → click Run Analysis → wait until ML Status is
              completed → click Refresh Results → annotated video and insight
              results will appear on this page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}