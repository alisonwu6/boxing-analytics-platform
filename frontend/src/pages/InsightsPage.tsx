import { useEffect, useMemo, useRef, useState } from "react";
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
  canFetchResults?: boolean;

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
  punchRate?: string;
  sessionDuration?: string;
  summary?: string;
  recommendations?: string[];
  uppercutCount?: number;
  hookCount?: number;
  jabCount?: number;
  punchEvents?: any[];
  [key: string]: any;
};

export default function InsightsPage() {
  const navigate = useNavigate();
  const params = useParams();

  const sessionId = params.sessionId || params.id || "";

  const [session, setSession] = useState<Session | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [insights, setInsights] = useState<InsightResult | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const [error, setError] = useState("");
  const [videoMessage, setVideoMessage] = useState("");
  const [insightMessage, setInsightMessage] = useState("");

  const pollingRef = useRef<number | null>(null);

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

  const formatDate = (value?: string) => {
    if (!value) return "N/A";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleString();
  };

  const normaliseSessionResponse = (
    data: any,
    previousSession?: Session | null
  ): Session => {
    const base =
      data?.data?.session ||
      data?.session ||
      data?.data ||
      data?.result ||
      data ||
      {};

    const dataWrapper = data?.data || data || {};

    return {
      ...(previousSession || {}),
      ...base,

      id: base.id || dataWrapper.id || previousSession?.id || sessionId,

      title:
        base.title ||
        dataWrapper.title ||
        previousSession?.title ||
        `Session ${sessionId.slice(0, 8)}`,

      status:
        base.status || dataWrapper.status || previousSession?.status || "N/A",

      processingStatus:
        base.processingStatus ||
        dataWrapper.processingStatus ||
        previousSession?.processingStatus ||
        "N/A",

      canFetchResults:
        base.canFetchResults ??
        dataWrapper.canFetchResults ??
        previousSession?.canFetchResults,

      csvUploadStatus:
        base.csvUploadStatus ||
        dataWrapper.csvUploadStatus ||
        previousSession?.csvUploadStatus,

      movUploadStatus:
        base.movUploadStatus ||
        dataWrapper.movUploadStatus ||
        previousSession?.movUploadStatus,

      sessionDate:
        base.sessionDate ||
        dataWrapper.sessionDate ||
        previousSession?.sessionDate,

      sessionStartAt:
        base.sessionStartAt ||
        dataWrapper.sessionStartAt ||
        previousSession?.sessionStartAt,

      createdAt:
        base.createdAt || dataWrapper.createdAt || previousSession?.createdAt,
    };
  };

  const isAnalysisFinished = (targetSession: Session | null) => {
    if (!targetSession) return false;

    return (
      targetSession.canFetchResults === true ||
      targetSession.status === "completed" ||
      targetSession.processingStatus === "completed"
    );
  };

  const isAnalysisFailed = (targetSession: Session | null) => {
    if (!targetSession) return false;

    return (
      targetSession.status === "failed" ||
      targetSession.processingStatus === "failed"
    );
  };

  const isAnalysisRunning = (targetSession: Session | null) => {
    if (!targetSession) return false;

    const processingStatus = targetSession.processingStatus || "";
    const status = targetSession.status || "";

    return (
      status === "processing" ||
      processingStatus === "queued" ||
      processingStatus === "preprocessing" ||
      processingStatus === "inferencing" ||
      processingStatus === "processing"
    );
  };

  const hasMovUploaded = (targetSession: Session | null) => {
    return targetSession?.movUploadStatus === "uploaded";
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
      data?.result?.videoUrl ||
      data?.result?.url ||
      ""
    );
  };

  const normaliseInsights = (data: any): InsightResult => {
    const source = data?.data || data?.result || data?.results || data || {};

    const metricsArray = Array.isArray(source.metrics) ? source.metrics : [];

    const resultSummaryArray = Array.isArray(source.resultSummary)
      ? source.resultSummary
      : [];

    const getMetric = (name: string) => {
      const item = metricsArray.find((metric: any) => metric.name === name);
      return item?.value ?? "N/A";
    };

    const toNumber = (value: any) => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : 0;
    };

    const uppercutCount = toNumber(getMetric("count_Uppercut"));
    const hookCount = toNumber(getMetric("count_Hook"));
    const jabCount = toNumber(getMetric("count_Jab"));

    const punchCounts = [
      { type: "Uppercut", value: uppercutCount },
      { type: "Hook", value: hookCount },
      { type: "Jab", value: jabCount },
    ];

    const dominantPunch =
      punchCounts.sort((a, b) => b.value - a.value)[0]?.type || "N/A";

    const totalPunches =
      source.totalPunches ||
      source.total_punches ||
      getMetric("totalPunches");

    const punchesPerMinute =
      source.punchesPerMinute ||
      source.punches_per_minute ||
      getMetric("punchesPerMinute");

    const sessionDurationSecs =
      source.sessionDurationSecs ||
      source.session_duration_secs ||
      getMetric("sessionDurationSecs");

    const formattedPunchRate =
      punchesPerMinute !== "N/A"
        ? `${Number(punchesPerMinute).toFixed(2)} punches/min`
        : "N/A";

    const formattedDuration =
      sessionDurationSecs !== "N/A"
        ? `${Number(sessionDurationSecs).toFixed(1)} sec`
        : "N/A";

    const summaryText =
      resultSummaryArray.length > 0
        ? resultSummaryArray
            .map((item: any) => {
              if (typeof item === "string") return item;
              return JSON.stringify(item);
            })
            .join(". ")
        : source.summaryText ||
          source.summary_text ||
          source.feedbackSummary ||
          source.feedback_summary ||
          source.summary ||
          "Analysis completed. The session results have been generated from the uploaded boxing data.";

    return {
      totalPunches,
      dominantPunch,
      punchRate: formattedPunchRate,
      sessionDuration: formattedDuration,

      summary: summaryText,

      recommendations: [
        `Your dominant punch type was ${dominantPunch}. Review whether this matches the training goal for this session.`,
        `You completed ${totalPunches} punches at an average rate of ${Number(
          punchesPerMinute || 0
        ).toFixed(2)} punches per minute.`,
        "Use the annotated video to review punch timing, body rotation, and recovery after each punch.",
      ],

      uppercutCount,
      hookCount,
      jabCount,
      punchEvents: Array.isArray(source.punchEvents) ? source.punchEvents : [],
    };
  };

  const loadSessionDetail = async () => {
    if (!sessionId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return null;
      }

      if (!res.ok) {
        console.warn("Session detail endpoint failed:", res.status);
        return null;
      }

      const data = await res.json();
      console.log("Session detail response:", data);

      const sessionData = normaliseSessionResponse(data, session);

      setSession(sessionData);

      return sessionData;
    } catch (err) {
      console.warn("Could not load session detail:", err);
      return null;
    }
  };

  const loadSessionStatus = async (previous?: Session | null) => {
    if (!sessionId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/status`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return previous || null;
      }

      if (!res.ok) {
        console.warn("Session status endpoint failed:", res.status);
        return previous || null;
      }

      const data = await res.json();
      console.log("Session status response:", data);

      const sessionData = normaliseSessionResponse(data, previous || session);

      setSession(sessionData);

      return sessionData;
    } catch (err) {
      console.warn("Could not load session status:", err);
      return previous || null;
    }
  };

  const loadAnnotatedVideo = async (targetSession?: Session | null) => {
    if (!sessionId) return;

    const currentSession = targetSession || session;

    if (!hasMovUploaded(currentSession)) {
      setVideoUrl("");
      setVideoMessage(
        "No MOV file was uploaded for this session, so annotated video is not available."
      );
      return;
    }

    if (!isAnalysisFinished(currentSession)) {
      setVideoUrl("");
      setVideoMessage(
        "Annotated video will appear after ML processing is completed."
      );
      return;
    }

    try {
      setVideoLoading(true);
      setVideoMessage("");

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
        setVideoMessage(
          "Annotated video is not ready yet. It may still be uploading or generating."
        );
        return;
      }

      if (res.status === 409) {
        setVideoUrl("");
        setVideoMessage(
          "Analysis is still processing. The annotated video will be available after ML processing is completed."
        );
        return;
      }

      if (res.status === 401) {
        setVideoUrl("");
        setVideoMessage("Unauthorized. Please login again.");
        return;
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        setVideoUrl("");
        setVideoMessage(`Failed to load annotated video: ${res.status} ${text}`);
        return;
      }

      const data = await res.json();
      console.log("Annotated video response:", data);

      const url = getVideoUrlFromResponse(data);

      if (!url) {
        setVideoUrl("");
        setVideoMessage("Backend did not return a video URL.");
        return;
      }

      setVideoUrl(url);
    } catch (err) {
      console.warn("Annotated video not ready:", err);
      setVideoUrl("");
      setVideoMessage("Could not load annotated video.");
    } finally {
      setVideoLoading(false);
    }
  };

  const loadInsights = async (targetSession?: Session | null) => {
    if (!sessionId) return;

    const currentSession = targetSession || session;

    if (!isAnalysisFinished(currentSession)) {
      setInsightMessage(
        "Analysis is still processing. Results will appear after ML processing is completed."
      );
      setInsights(normaliseInsights({}));
      return;
    }

    try {
      setInsightLoading(true);
      setInsightMessage("");

      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/results`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (res.status === 404) {
        setInsightMessage("Insight results are not ready yet.");
        setInsights(normaliseInsights({}));
        return;
      }

      if (res.status === 409) {
        setInsightMessage(
          "Analysis is still processing. Results will appear after ML processing is completed."
        );
        setInsights(normaliseInsights({}));
        return;
      }

      if (res.status === 401) {
        setInsightMessage("Unauthorized. Please login again.");
        setInsights(normaliseInsights({}));
        return;
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        setInsightMessage(`Failed to load insight results: ${res.status} ${text}`);
        setInsights(normaliseInsights({}));
        return;
      }

      const data = await res.json();
      console.log("Insight results response:", data);

      setInsights(normaliseInsights(data));
    } catch (err) {
      console.warn("Insight results not ready:", err);
      setInsightMessage("Could not load insight results.");
      setInsights(normaliseInsights({}));
    } finally {
      setInsightLoading(false);
    }
  };

  const loadResultsIfReady = async (targetSession: Session | null) => {
    if (!targetSession) return;

    if (isAnalysisFinished(targetSession)) {
      await Promise.all([
        loadInsights(targetSession),
        loadAnnotatedVideo(targetSession),
      ]);
      return;
    }

    if (isAnalysisFailed(targetSession)) {
      setInsightMessage(
        "Analysis failed. Please check the uploaded files or rerun analysis."
      );
      setVideoMessage("Analysis failed, so annotated video is not available.");
      setInsights(normaliseInsights({}));
      return;
    }

    setInsightMessage(
      "Analysis is still processing. Results will appear after ML processing is completed."
    );

    if (hasMovUploaded(targetSession)) {
      setVideoMessage(
        "Annotated video will appear after ML processing is completed."
      );
    } else {
      setVideoMessage(
        "No MOV file was uploaded for this session, so annotated video is not available."
      );
    }

    setInsights(normaliseInsights({}));
  };

  const clearPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = () => {
    clearPolling();

    pollingRef.current = window.setInterval(async () => {
      const currentSession = await loadSessionStatus(session);

      if (!currentSession) return;

      if (isAnalysisFinished(currentSession)) {
        clearPolling();
        await loadResultsIfReady(currentSession);
      }

      if (isAnalysisFailed(currentSession)) {
        clearPolling();
        await loadResultsIfReady(currentSession);
      }
    }, 5000);
  };

  const loadPage = async () => {
    try {
      setPageLoading(true);
      setError("");
      setVideoMessage("");
      setInsightMessage("");

      const detail = await loadSessionDetail();
      const status = await loadSessionStatus(detail);
      const currentSession = status || detail;

      await loadResultsIfReady(currentSession);

      if (
        currentSession &&
        isAnalysisRunning(currentSession) &&
        !isAnalysisFinished(currentSession)
      ) {
        startPolling();
      }
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

    return () => {
      clearPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleStartAnalysis = async () => {
    if (!sessionId) return;

    try {
      setAnalyzeLoading(true);
      setError("");
      setVideoMessage("");
      setInsightMessage("");

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
        setInsightMessage(
          "Analysis has already started or is still processing. The page will keep checking the status."
        );

        const currentSession = await loadSessionStatus(session);
        if (currentSession && isAnalysisRunning(currentSession)) {
          startPolling();
        }

        return;
      }

      if (!res.ok) {
        const text = await readErrorText(res);
        setError(`Could not start analysis: ${res.status} ${text}`);
        return;
      }

      const currentSession = await loadSessionStatus(session);

      setInsightMessage(
        "Analysis has started. This page will automatically refresh when results are ready."
      );

      if (currentSession) {
        startPolling();
      }
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

  const statusClass = (status?: string) => {
    const value = (status || "").toLowerCase();

    if (value === "completed" || value === "complete") {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (value === "ready" || value === "uploaded") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (
      value === "processing" ||
      value === "queued" ||
      value === "preprocessing" ||
      value === "inferencing"
    ) {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    if (value === "failed" || value === "error") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-purple-100 text-purple-700 border-purple-200";
  };

  const canRunAnalysis = useMemo(() => {
    if (!session) return false;

    const hasUploadedFile =
      session.csvUploadStatus === "uploaded" ||
      session.movUploadStatus === "uploaded";

    return (
      session.status === "ready" &&
      hasUploadedFile &&
      !isAnalysisRunning(session) &&
      !isAnalysisFinished(session)
    );
  }, [session]);

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
      label: "Punch Rate",
      value: insights?.punchRate ?? "N/A",
      icon: Zap,
    },
    {
      label: "Session Duration",
      value: insights?.sessionDuration ?? "N/A",
      icon: TrendingUp,
    },
  ];

  const punchBreakdown = [
    {
      label: "Uppercut",
      value: insights?.uppercutCount ?? 0,
    },
    {
      label: "Hook",
      value: insights?.hookCount ?? 0,
    },
    {
      label: "Jab",
      value: insights?.jabCount ?? 0,
    },
  ];

  const maxPunchTypeValue = Math.max(
    ...punchBreakdown.map((item) => Number(item.value) || 0),
    1
  );

  const punchTimeline = useMemo(() => {
    const events = insights?.punchEvents || [];

    if (!Array.isArray(events) || events.length === 0) return [];

    const bucketSize = 30;
    const buckets: Record<string, number> = {};

    events.forEach((event: any) => {
      const time = Number(event.t || event.time || event.timestamp || 0);

      if (!Number.isFinite(time)) return;

      const bucketStart = Math.floor(time / bucketSize) * bucketSize;
      const bucketLabel = `${bucketStart}-${bucketStart + bucketSize}s`;

      buckets[bucketLabel] = (buckets[bucketLabel] || 0) + 1;
    });

    return Object.entries(buckets).map(([label, value]) => ({
      label,
      value,
    }));
  }, [insights]);

  const maxTimelineValue = Math.max(
    ...punchTimeline.map((item) => Number(item.value) || 0),
    1
  );

  const eventPreview = Array.isArray(insights?.punchEvents)
    ? insights.punchEvents.slice(0, 8)
    : [];

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl rounded-[28px] bg-white px-8 py-10 shadow-sm">
        <div className="relative mb-10 text-center">
          <button
            onClick={() => navigate("/sessions")}
            className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
            aria-label="Back to sessions"
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

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">Session</p>
            <p className="mt-2 break-all text-lg font-bold text-purple-600">
              {session?.title || `Session ${sessionId.slice(0, 8)}`}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">
              Session Status
            </p>
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
                session?.sessionDate ||
                  session?.sessionStartAt ||
                  session?.createdAt
              )}
            </p>
          </div>
        </div>

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
                This area displays annotated_video.mp4 after ML processing is
                completed.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleStartAnalysis}
                disabled={!canRunAnalysis || analyzeLoading}
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
                  {videoMessage ||
                    "If a MOV file was uploaded, the annotated video will appear after processing is completed."}
                </p>
              </div>
            </div>
          )}
        </div>

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

          {insightMessage && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-yellow-700">
              <AlertCircle size={20} />
              <span>{insightMessage}</span>
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
              <div className="mb-4 flex items-center gap-2">
                <Activity className="text-purple-600" size={22} />
                <h3 className="text-xl font-bold text-gray-800">
                  Punch Type Distribution
                </h3>
              </div>

              <p className="mb-5 text-sm text-gray-500">
                This chart shows how many punches were detected for each punch
                type.
              </p>

              <div className="space-y-4">
                {punchBreakdown.map((item) => {
                  const width = `${Math.max(
                    (Number(item.value) / maxPunchTypeValue) * 100,
                    4
                  )}%`;

                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-700">
                          {item.label}
                        </span>
                        <span className="font-bold text-purple-600">
                          {item.value}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-purple-500"
                          style={{ width }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl bg-white p-4 text-sm text-gray-600">
                Dominant punch:{" "}
                <span className="font-bold text-purple-600">
                  {insights?.dominantPunch || "N/A"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="text-purple-600" size={22} />
                <h3 className="text-xl font-bold text-gray-800">
                  Punch Timeline
                </h3>
              </div>

              <p className="mb-5 text-sm text-gray-500">
                Punch events are grouped into 30-second blocks to show activity
                rhythm.
              </p>

              {punchTimeline.length > 0 ? (
                <div className="space-y-3">
                  {punchTimeline.map((item) => {
                    const width = `${Math.max(
                      (Number(item.value) / maxTimelineValue) * 100,
                      4
                    )}%`;

                    return (
                      <div key={item.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-600">
                            {item.label}
                          </span>
                          <span className="font-bold text-purple-600">
                            {item.value}
                          </span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-purple-400"
                            style={{ width }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-white p-4 text-sm text-gray-500">
                  Punch timeline data is not available yet.
                </div>
              )}
            </div>
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

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-sm text-gray-500">Uppercut</p>
                  <p className="text-xl font-bold text-purple-600">
                    {insights?.uppercutCount ?? 0}
                  </p>
                </div>

                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-sm text-gray-500">Hook</p>
                  <p className="text-xl font-bold text-purple-600">
                    {insights?.hookCount ?? 0}
                  </p>
                </div>

                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-sm text-gray-500">Jab</p>
                  <p className="text-xl font-bold text-purple-600">
                    {insights?.jabCount ?? 0}
                  </p>
                </div>
              </div>
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

          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-6">
            <div className="mb-3 flex items-center gap-2">
              <Target className="text-purple-600" size={22} />
              <h3 className="text-xl font-bold text-gray-800">
                Punch Event Preview
              </h3>
            </div>

            <p className="mb-5 text-sm text-gray-500">
              A sample of detected punch events from the ML output.
            </p>

            {eventPreview.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Punch Type</th>
                      <th className="px-4 py-2">Hand</th>
                      <th className="px-4 py-2">Confidence</th>
                    </tr>
                  </thead>

                  <tbody>
                    {eventPreview.map((event: any, index: number) => (
                      <tr key={index} className="bg-white text-gray-700">
                        <td className="rounded-l-xl px-4 py-3">
                          {Number(event.t || event.time || 0).toFixed(2)}s
                        </td>

                        <td className="px-4 py-3 font-semibold text-purple-600">
                          {event.type || "Unknown"}
                        </td>

                        <td className="px-4 py-3">
                          {event.hand || "Unknown"}
                        </td>

                        <td className="rounded-r-xl px-4 py-3">
                          {event.confidence !== undefined
                            ? `${(Number(event.confidence) * 100).toFixed(1)}%`
                            : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl bg-white p-4 text-sm text-gray-500">
                Punch event data is not available yet.
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-5 text-purple-700">
            <p className="font-semibold">Current insight coverage</p>
            <p className="mt-1">
              This page currently visualises punch volume, punch cadence, punch
              type classification, punch distribution, timeline pattern, and
              event-level preview based on the current backend ML output.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}