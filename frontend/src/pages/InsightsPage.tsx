;import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  LineChart as LineChartIcon,
  Loader2,
  PieChart as PieChartIcon,
  Play,
  RefreshCw,
  Timer,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type InsightView = "ml" | "video";

type SessionData = {
  id: string;
  title?: string;
  status?: string;
  processingStatus?: string;
  csvUploadStatus?: string;
  movUploadStatus?: string;
  csvKey?: string;
  movKey?: string;
  errorMessage?: string;
  results?: unknown;
};

type StatusData = {
  status?: string;
  processingStatus?: string;
  canFetchResults?: boolean;
  errorMessage?: string;
};

type MLResults = {
  sessionId?: string;
  modelVersion?: string;
  resultSummary?: string[];
  metrics?: unknown;
  punchEvents?: Record<string, unknown>[];
  videoPunchEvents?: Record<string, unknown>[];
  artifacts?: Record<string, unknown>;
  advancedInsights?: {
    available?: boolean;
    [key: string]: unknown;
  };
  errorMessage?: string | null;
};

type VideoResult = {
  videoUrl?: string;
  url?: string;
  signedUrl?: string;
  expiresIn?: number;
};

type MetricItem = {
  label: string;
  value: unknown;
};
type VideoOptions = {
  model: "mediapipe" | "yolo";
  duration: string;
  noRender: boolean;
  noExcel: boolean;
  noCsv: boolean;
  enableImuOverlay: boolean;
  sync: boolean;
  syncAuto: boolean;
  offsetR: string;
  offsetL: string;
  jumpWindowStart: string;
  jumpWindowEnd: string;
};

const CHART_COLORS = [
  "#7c3aed",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#ec4899",
];

export default function InsightsPage() {
  const params = useParams();
  const navigate = useNavigate();

  const sessionId = params.sessionId || params.id;

  const [activeView, setActiveView] = useState<InsightView>("ml");

  const [session, setSession] = useState<SessionData | null>(null);
  const [mlResults, setMlResults] = useState<MLResults | null>(null);
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    model: "mediapipe",
    duration: "30",
    noRender: false,
    noExcel: true,
    noCsv: true,
    enableImuOverlay: false,
    sync: false,
    syncAuto: false,
    offsetR: "",
    offsetL: "",
    jumpWindowStart: "",
    jumpWindowEnd: "",
    });

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken");

  const hasCsv = useMemo(() => {
    return (
      session?.csvUploadStatus === "uploaded" ||
      session?.csvUploadStatus === "completed" ||
      Boolean(session?.csvKey)
    );
  }, [session]);

  const hasMov = useMemo(() => {
    return (
      session?.movUploadStatus === "uploaded" ||
      session?.movUploadStatus === "completed" ||
      Boolean(session?.movKey)
    );
  }, [session]);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session id.");
      setLoading(false);
      return;
    }

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;

      try {
        const data = await response.json();
        message =
          data.message ||
          data.error ||
          data.errorMessage ||
          JSON.stringify(data);
      } catch {
        const text = await response.text();
        if (text) message = text;
      }

      throw new Error(message);
    }

    return response.json();
  }

  function unwrapSession(data: any): SessionData {
    return data.session || data.data || data;
  }

  function unwrapResults(data: any): MLResults {
    return data.results || data.data || data;
  }

  function unwrapVideoResult(data: any): VideoResult {
    return data.result || data.data || data;
  }

  async function loadSession() {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError("");

      const data = await apiFetch<any>(`/sessions/${sessionId}`);
      const sessionData = unwrapSession(data);

      setSession(sessionData);

      if (
        sessionData.status === "completed" ||
        sessionData.processingStatus === "completed"
      ) {
        await loadResults();
      }
    } catch (err: any) {
      setError(err.message || "Failed to load session.");
    } finally {
      setLoading(false);
    }
  }

  async function startAnalysis() {
  if (!sessionId) return;

  try {
    setAnalyzing(true);
    setError("");

    await apiFetch(`/sessions/${sessionId}/analyze`, {
      method: "POST",
      body: JSON.stringify({
        videoOptions: {
          ...videoOptions,
          duration: videoOptions.duration.trim() === "" ? "" : Number(videoOptions.duration),
          jumpWindowStart: videoOptions.jumpWindowStart.trim(),
          jumpWindowEnd: videoOptions.jumpWindowEnd.trim(),
          offsetR: videoOptions.offsetR.trim(),
          offsetL: videoOptions.offsetL.trim(),
        },
      }),
    });

    await pollStatus();
  } catch (err: any) {
    setError(err.message || "Failed to start analysis.");
    setAnalyzing(false);
  }
}

  async function pollStatus() {
    if (!sessionId) return;

    const maxAttempts = 300;
    let attempts = 0;

    const intervalId = window.setInterval(async () => {
      attempts += 1;

      try {
        const statusData = await apiFetch<StatusData>(
          `/sessions/${sessionId}/status`
        );

        setSession((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            status: statusData.status || prev.status,
            processingStatus:
              statusData.processingStatus || prev.processingStatus,
            errorMessage: statusData.errorMessage,
          };
        });

        if (
          statusData.canFetchResults ||
          statusData.status === "completed" ||
          statusData.processingStatus === "completed"
        ) {
          window.clearInterval(intervalId);
          setAnalyzing(false);
          await loadResults();
          return;
        }

        if (
          statusData.status === "failed" ||
          statusData.processingStatus === "failed"
        ) {
          window.clearInterval(intervalId);
          setAnalyzing(false);
          setError(statusData.errorMessage || "Analysis failed.");
          return;
        }

        if (attempts >= maxAttempts) {
          window.clearInterval(intervalId);
          setAnalyzing(false);
          setError("Analysis timed out. Please refresh and check again.");
        }
      } catch (err: any) {
        window.clearInterval(intervalId);
        setAnalyzing(false);
        setError(err.message || "Failed to check analysis status.");
      }
    }, 3000);
  }

  async function loadResults() {
    if (!sessionId) return;

    try {
      setLoadingResults(true);

      try {
        const mlData = await apiFetch<any>(`/sessions/${sessionId}/results`);
        setMlResults(unwrapResults(mlData));
      } catch {
        setMlResults(null);
      }

      try {
        const videoData = await apiFetch<any>(
          `/sessions/${sessionId}/results/video`
        );
        setVideoResult(unwrapVideoResult(videoData));
      } catch {
        setVideoResult(null);
      }
    } finally {
      setLoadingResults(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading insights...
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <HeaderCard
          session={session}
          hasCsv={hasCsv}
          hasMov={hasMov}
          analyzing={analyzing}
          onBack={() => navigate(-1)}
          onRefresh={loadSession}
          onAnalyze={startAnalysis}
        />

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <InsightViewSwitcher
          activeView={activeView}
          onChange={setActiveView}
        />
        {activeView === "video" && (
          <VideoAnalysisOptionsPanel
            options={videoOptions}
            onChange={setVideoOptions}
          />
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {loadingResults ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="flex items-center gap-3 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading results...
              </div>
            </div>
          ) : activeView === "ml" ? (
            <MLAnalysisView hasCsv={hasCsv} mlResults={mlResults} />
          ) : (
            <VideoAnalysisView
              hasMov={hasMov}
              videoResult={videoResult}
              mlResults={mlResults}
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 p-6">{children}</div>;
}

function HeaderCard({
  session,
  hasCsv,
  hasMov,
  analyzing,
  onBack,
  onRefresh,
  onAnalyze,
}: {
  session: SessionData | null;
  hasCsv: boolean;
  hasMov: boolean;
  analyzing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 p-6 text-white">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/80 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {session?.title || "Session Insights"}
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-purple-100">
              Review CSV/ML analysis and video analysis separately using the
              switcher below.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <StatusPill
                label="CSV"
                value={hasCsv ? "Uploaded" : "Missing"}
                active={hasCsv}
                light
              />
              <StatusPill
                label="Video"
                value={hasMov ? "Uploaded" : "Missing"}
                active={hasMov}
                light
              />
              <StatusPill
                label="Status"
                value={session?.processingStatus || session?.status || "Idle"}
                active={
                  session?.status === "completed" ||
                  session?.processingStatus === "completed"
                }
                light
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              onClick={onAnalyze}
              disabled={analyzing || (!hasCsv && !hasMov)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white/70"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Analysis
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightViewSwitcher({
  activeView,
  onChange,
}: {
  activeView: InsightView;
  onChange: (view: InsightView) => void;
}) {
  const views = [
    {
      key: "ml" as const,
      label: "ML / CSV Analysis",
      description: "Sensor-based punch charts and metrics",
      icon: Activity,
    },
    {
      key: "video" as const,
      label: "Video Analysis",
      description: "Annotated movement review with punch matching",
      icon: Video,
    },
  ];

  const activeIndex = views.findIndex((view) => view.key === activeView);
  const activeItem = views[activeIndex];
  const ActiveIcon = activeItem.icon;

  function goPrevious() {
    const previousIndex = activeIndex === 0 ? views.length - 1 : activeIndex - 1;
    onChange(views[previousIndex].key);
  }

  function goNext() {
    const nextIndex = activeIndex === views.length - 1 ? 0 : activeIndex + 1;
    onChange(views[nextIndex].key);
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
      <div className="flex items-center justify-center gap-8">
        <button
          onClick={goPrevious}
          className="rounded-full p-3 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Previous view"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div className="flex min-w-[280px] flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-50 text-purple-600">
            <ActiveIcon className="h-11 w-11" />
          </div>

          <h2 className="mt-4 text-xl font-bold text-slate-900">
            {activeItem.label}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {activeItem.description}
          </p>

          <div className="mt-4 flex gap-2">
            {views.map((view) => (
              <button
                key={view.key}
                onClick={() => onChange(view.key)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  activeView === view.key
                    ? "bg-purple-600"
                    : "bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label={`Switch to ${view.label}`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={goNext}
          className="rounded-full p-3 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Next view"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}

function MLAnalysisView({
  hasCsv,
  mlResults,
}: {
  hasCsv: boolean;
  mlResults: MLResults | null;
}) {
  if (!hasCsv) {
    return (
      <EmptyState
        icon={FileText}
        title="No CSV file uploaded"
        message="Upload a CSV file to view ML and sensor-based punch analysis."
      />
    );
  }

  if (!mlResults) {
    return (
      <EmptyState
        icon={Activity}
        title="No ML results yet"
        message="Run analysis first. The ML results will appear here after processing is complete."
      />
    );
  }

  const punchEvents = Array.isArray(mlResults.punchEvents)
    ? mlResults.punchEvents
    : [];

  const resultSummary = Array.isArray(mlResults.resultSummary)
    ? mlResults.resultSummary
    : [];

  const metrics = normaliseMetrics(mlResults.metrics);

  const punchTypeData = buildPunchTypeData(punchEvents);
  const accelerationTrendData = buildAccelerationTrendData(punchEvents);
  const timingData = buildTimingData(punchEvents);
  const confidenceData = buildConfidenceTrendData(punchEvents);

  const totalPunches = punchEvents.length;
  const avgConfidence = average(
    punchEvents
      .map((event) => getConfidence(event))
      .filter((value): value is number => value !== null)
  );
  const avgPeakAcceleration = average(
    punchEvents
      .map((event) => getPeakAcceleration(event))
      .filter((value): value is number => value !== null)
  );
  const dominantPunch =
    punchTypeData.length > 0
      ? punchTypeData.reduce((max, item) =>
          item.value > max.value ? item : max
        ).name
      : "N/A";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
        <h2 className="text-2xl font-bold">ML / CSV Analysis</h2>
        <p className="mt-2 max-w-3xl text-sm text-purple-100">
          This section summarises punch distribution, acceleration trend,
          confidence stability, and movement timing from the uploaded CSV / IMU
          sensor data.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Punches" value={totalPunches} />
        <SummaryCard title="Dominant Punch" value={dominantPunch} />
        <SummaryCard
          title="Avg Confidence"
          value={avgConfidence === null ? "N/A" : avgConfidence.toFixed(2)}
        />
        <SummaryCard
          title="Avg Peak Acc."
          value={
            avgPeakAcceleration === null
              ? "N/A"
              : avgPeakAcceleration.toFixed(2)
          }
        />
        <SummaryCard
          title="Model Version"
          value={mlResults.modelVersion || "N/A"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          icon={PieChartIcon}
          title="Punch Type Distribution"
          description="Shows whether the session was jab-heavy, hook-heavy, uppercut-heavy, or balanced."
        >
          {punchTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={punchTypeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={115}
                  paddingAngle={4}
                  label
                >
                  {punchTypeData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No punch type data available." />
          )}
        </ChartCard>

        <ChartCard
          icon={LineChartIcon}
          title="Peak Acceleration Trend"
          description="Shows whether punch power increased, dropped, or stayed stable across the session."
        >
          {accelerationTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={accelerationTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="peakAcceleration"
                  name="Peak Acceleration"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No acceleration data available." />
          )}
        </ChartCard>

        <ChartCard
          icon={BarChart3}
          title="Forward vs Retraction Time"
          description="Compares punch delivery speed and recovery speed for the first detected punches."
        >
          {timingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={timingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="forwardTime"
                  name="Forward Time"
                  fill="#8b5cf6"
                  radius={[8, 8, 0, 0]}
                />
                <Bar
                  dataKey="retractionTime"
                  name="Retraction Time"
                  fill="#06b6d4"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No timing data available." />
          )}
        </ChartCard>

        <ChartCard
          icon={Timer}
          title="Confidence Trend"
          description="Shows how stable the ML model confidence was across detected punches."
        >
          {confidenceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={confidenceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="confidence"
                  name="Confidence"
                  stroke="#10b981"
                  fill="#d1fae5"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No confidence data available." />
          )}
        </ChartCard>
      </div>

      {resultSummary.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">Result Summary</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            {resultSummary.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">Metrics</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric, index) => (
              <div key={index} className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-600">{metric.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {String(metric.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <PunchEventsTable events={punchEvents} />
    </div>
  );
}

function VideoAnalysisView({
  hasMov,
  videoResult,
  mlResults,
}: {
  hasMov: boolean;
  videoResult: VideoResult | null;
  mlResults: MLResults | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedPunchIndex, setSelectedPunchIndex] = useState<number | null>(
    null
  );

  if (!hasMov) {
    return (
      <EmptyState
        icon={Video}
        title="No video file uploaded"
        message="Upload a MOV or MP4 file to view video analysis."
      />
    );
  }

  const videoUrl =
    videoResult?.videoUrl || videoResult?.url || videoResult?.signedUrl;

  if (!videoUrl) {
    return (
      <EmptyState
        icon={Clock}
        title="No video result yet"
        message="Run analysis first. The annotated video will appear here after processing is complete."
      />
    );
  }

  const videoPunchEvents = getVideoPunchEvents(mlResults);

  const activePunchIndex = getActivePunchIndex(videoPunchEvents, currentTime);
  const displayActiveIndex =
    selectedPunchIndex !== null ? selectedPunchIndex : activePunchIndex;

  const activePunch =
    displayActiveIndex !== null ? videoPunchEvents[displayActiveIndex] : null;

  function handlePunchClick(index: number) {
    const event = videoPunchEvents[index];
    const seekTime = getVideoEventSeekTime(event);

    if (seekTime === null) return;

    setSelectedPunchIndex(index);

    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(seekTime - 0.35, 0);
      videoRef.current.play().catch(() => {});
    }
  }

  function handleTimeUpdate() {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const activeIndex = getActivePunchIndex(videoPunchEvents, time);

    if (activeIndex !== null) {
      setSelectedPunchIndex(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 to-purple-900 p-6 text-white">
        <h2 className="text-2xl font-bold">Video Analysis</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-200">
          Watch the annotated video and match each detected punch with its
          timing, hand, type, and movement metrics.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              className="h-auto w-full"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard title="Video Result" value="Available" />
            <SummaryCard
              title="Current Time"
              value={`${currentTime.toFixed(2)}s`}
            />
            <SummaryCard
              title="Detected Punches"
              value={videoPunchEvents.length}
            />
            <SummaryCard
              title="URL Expiry"
              value={
                videoResult?.expiresIn ? `${videoResult.expiresIn}s` : "N/A"
              }
            />
          </div>

          {activePunch && (
            <div className="rounded-3xl border border-purple-200 bg-purple-50 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-600 text-lg font-bold text-white">
                  #{displayActiveIndex !== null ? displayActiveIndex + 1 : "-"}
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold text-purple-950">
                    Current Matched Punch
                  </h3>

                  <p className="mt-1 text-sm text-purple-700">
                    {getPunchType(activePunch)} ·{" "}
                    {formatValue(
                      activePunch.hand ||
                        activePunch.punchHand ||
                        activePunch.punch_hand ||
                        activePunch.side
                    )}{" "}
                    hand · Time {formatValue(getVideoEventSeekTime(activePunch))}
                    s
                  </p>

                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-purple-500">Forward Time</p>
                      <p className="font-bold text-purple-950">
                        {formatValue(getForwardTime(activePunch))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-purple-500">Retraction Time</p>
                      <p className="font-bold text-purple-950">
                        {formatValue(getRetractionTime(activePunch))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-purple-500">Speed</p>
                      <p className="font-bold text-purple-950">
                        {formatValue(
                          activePunch.speedPx ||
                            activePunch.speed_px ||
                            activePunch.speed
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <VideoPunchTimeline
          events={videoPunchEvents}
          currentTime={currentTime}
          activeIndex={displayActiveIndex}
          onPunchClick={handlePunchClick}
        />
      </div>
    </div>
  );
}

function VideoPunchTimeline({
  events,
  currentTime,
  activeIndex,
  onPunchClick,
}: {
  events: Record<string, unknown>[];
  currentTime: number;
  activeIndex: number | null;
  onPunchClick: (index: number) => void;
}) {
  if (!events.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Punch Matching</h3>
        <p className="mt-2 text-sm text-slate-500">
          No video punch events were returned. The video can still be watched,
          but punch-by-punch matching needs videoPunchEvents from the backend.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">Punch Matching</h3>
        <p className="mt-1 text-sm text-slate-500">
          Click a punch to jump to that moment in the video. The active punch
          changes as the video plays.
        </p>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Video Time</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {currentTime.toFixed(2)}s
        </p>
      </div>

      <div className="max-h-[680px] space-y-3 overflow-y-auto pr-2">
        {events.map((event, index) => {
          const isActive = activeIndex === index;
          const time = getVideoEventSeekTime(event);
          const startTime = getVideoEventStartTime(event);
          const endTime = getVideoEventEndTime(event);

          return (
            <button
              key={index}
              onClick={() => onPunchClick(index)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                isActive
                  ? "border-purple-500 bg-purple-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-purple-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold ${
                      isActive
                        ? "bg-purple-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {index + 1}
                  </span>

                  <div>
                    <p className="font-bold text-slate-900">
                      {getPunchType(event)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatValue(
                        event.hand ||
                          event.punchHand ||
                          event.punch_hand ||
                          event.side
                      )}{" "}
                      hand
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {time === null ? "N/A" : `${time.toFixed(2)}s`}
                  </p>
                  <p className="text-xs text-slate-500">jump to time</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-slate-400">Start</p>
                  <p className="font-semibold text-slate-700">
                    {startTime === null ? "N/A" : `${startTime.toFixed(2)}s`}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-slate-400">End</p>
                  <p className="font-semibold text-slate-700">
                    {endTime === null ? "N/A" : `${endTime.toFixed(2)}s`}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-slate-400">Forward</p>
                  <p className="font-semibold text-slate-700">
                    {formatValue(getForwardTime(event))}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-slate-400">Retraction</p>
                  <p className="font-semibold text-slate-700">
                    {formatValue(getRetractionTime(event))}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoAnalysisOptionsPanel({
  options,
  onChange,
}: {
  options: VideoOptions;
  onChange: React.Dispatch<React.SetStateAction<VideoOptions>>;
}) {
  function updateOption<K extends keyof VideoOptions>(
    key: K,
    value: VideoOptions[K]
  ) {
    onChange((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">
          Video Analysis Options
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          These options are passed to the Python video analysis command as CLI flags.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">
            Pose Model
          </label>
          <select
            value={options.model}
            onChange={(event) =>
              updateOption("model", event.target.value as "mediapipe" | "yolo")
            }
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
          >
            <option value="mediapipe">MediaPipe faster CPU</option>
            <option value="yolo">YOLO slower, better occlusion</option>
          </select>
          <p className="text-xs text-slate-500">
            CLI: <code>--model {options.model}</code>
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">
            Duration seconds
          </label>
          <input
            type="number"
            min="1"
            placeholder="Empty = full video"
            value={options.duration}
            onChange={(event) => updateOption("duration", event.target.value)}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
          />
          <p className="text-xs text-slate-500">
            CLI:{" "}
            {options.duration.trim()
              ? `--duration ${options.duration}`
              : "full video"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">
            Output Mode
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Keep <strong>Render Video</strong> on if you want the annotated video
            to display in this page.
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OptionToggle
          title="Render annotated video"
          description="Needed for video playback."
          checked={!options.noRender}
          onChange={(checked) => updateOption("noRender", !checked)}
          cliFlag={options.noRender ? "--no-render" : "render enabled"}
        />

        <OptionToggle
          title="Skip Excel report"
          description="Faster processing."
          checked={options.noExcel}
          onChange={(checked) => updateOption("noExcel", checked)}
          cliFlag={options.noExcel ? "--no-excel" : "excel enabled"}
        />

        <OptionToggle
          title="Skip tracking CSV"
          description="Faster processing."
          checked={options.noCsv}
          onChange={(checked) => updateOption("noCsv", checked)}
          cliFlag={options.noCsv ? "--no-csv" : "tracking csv enabled"}
        />

        <OptionToggle
          title="IMU overlay"
          description="Requires CSV and IMU package."
          checked={options.enableImuOverlay}
          onChange={(checked) => updateOption("enableImuOverlay", checked)}
          cliFlag={
            options.enableImuOverlay ? "--imu-analysis" : "imu overlay off"
          }
        />
      </div>

      {options.enableImuOverlay && (
        <div className="mt-6 rounded-3xl border border-purple-100 bg-purple-50 p-5">
          <div className="mb-4">
            <h4 className="font-bold text-purple-950">IMU Synchronisation</h4>
            <p className="mt-1 text-sm text-purple-700">
              Use these only if you want to align video time with IMU sensor time.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OptionToggle
              title="Enable sync"
              description="Adds --sync"
              checked={options.sync}
              onChange={(checked) => updateOption("sync", checked)}
              cliFlag={options.sync ? "--sync" : "sync off"}
            />

            <OptionToggle
              title="Auto sync"
              description="Uses jump window."
              checked={options.syncAuto}
              onChange={(checked) => updateOption("syncAuto", checked)}
              cliFlag={options.syncAuto ? "--sync-auto" : "manual sync"}
            />

            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-950">
                Offset R seconds
              </label>
              <input
                type="number"
                step="0.1"
                value={options.offsetR}
                onChange={(event) =>
                  updateOption("offsetR", event.target.value)
                }
                placeholder="e.g. 9.4"
                className="w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
              <p className="text-xs text-purple-700">
                CLI:{" "}
                {options.offsetR ? `--offset-r ${options.offsetR}` : "not set"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-950">
                Offset L seconds
              </label>
              <input
                type="number"
                step="0.1"
                value={options.offsetL}
                onChange={(event) =>
                  updateOption("offsetL", event.target.value)
                }
                placeholder="e.g. 11.0"
                className="w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
              <p className="text-xs text-purple-700">
                CLI:{" "}
                {options.offsetL ? `--offset-l ${options.offsetL}` : "not set"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-950">
                Jump Window Start
              </label>
              <input
                type="number"
                step="0.1"
                value={options.jumpWindowStart}
                onChange={(event) =>
                  updateOption("jumpWindowStart", event.target.value)
                }
                placeholder="e.g. 5"
                className="w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-950">
                Jump Window End
              </label>
              <input
                type="number"
                step="0.1"
                value={options.jumpWindowEnd}
                onChange={(event) =>
                  updateOption("jumpWindowEnd", event.target.value)
                }
                placeholder="e.g. 25"
                className="w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
        <p className="mb-2 font-semibold text-white">Command flags preview</p>
        <code className="whitespace-pre-wrap break-words">
          {buildVideoCommandPreview(options)}
        </code>
      </div>
    </div>
  );
}

function OptionToggle({
  title,
  description,
  checked,
  onChange,
  cliFlag,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  cliFlag: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-purple-200 hover:bg-purple-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
      />

      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
        <p className="mt-2 rounded-lg bg-white px-2 py-1 font-mono text-xs text-slate-500">
          {cliFlag}
        </p>
      </div>
    </label>
  );
}

function buildVideoCommandPreview(options: VideoOptions) {
  const flags = [
    "python analyse.py",
    "--video input.mov",
    `--model ${options.model}`,
  ];

  if (options.duration.trim()) {
    flags.push(`--duration ${options.duration}`);
  }

  if (options.noRender) flags.push("--no-render");
  if (options.noExcel) flags.push("--no-excel");
  if (options.noCsv) flags.push("--no-csv");

  if (options.enableImuOverlay) {
    flags.push("--imu-r imu.csv");
    flags.push("--imu-analysis");

    if (options.sync) flags.push("--sync");
    if (options.syncAuto) flags.push("--sync-auto");
    if (options.offsetR.trim()) flags.push(`--offset-r ${options.offsetR}`);
    if (options.offsetL.trim()) flags.push(`--offset-l ${options.offsetL}`);

    if (options.jumpWindowStart.trim() && options.jumpWindowEnd.trim()) {
      flags.push(
        `--jump-window ${options.jumpWindowStart} ${options.jumpWindowEnd}`
      );
    }
  }

  return flags.join(" ");
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
          <Icon className="h-6 w-6" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      {children}
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
      {message}
    </div>
  );
}

function StatusPill({
  label,
  value,
  active,
  light,
}: {
  label: string;
  value: string;
  active: boolean;
  light?: boolean;
}) {
  if (light) {
    return (
      <span
        className={`rounded-full px-3 py-1 ${
          active
            ? "bg-white/20 text-white"
            : "bg-white/10 text-white/75"
        }`}
      >
        {label}: {value}
      </span>
    );
  }

  return (
    <span
      className={`rounded-full px-3 py-1 ${
        active
          ? "bg-purple-50 text-purple-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}: {value}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-purple-600 shadow-sm">
        <Icon className="h-8 w-8" />
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
    </div>
  );
}

function PunchEventsTable({ events }: { events: Record<string, unknown>[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900">Punch Events</h3>
        <p className="mt-2 text-sm text-slate-500">
          No punch events were returned.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900">Punch Events</h3>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-3 pr-4 font-medium">#</th>
              <th className="py-3 pr-4 font-medium">Type</th>
              <th className="py-3 pr-4 font-medium">Hand</th>
              <th className="py-3 pr-4 font-medium">Time</th>
              <th className="py-3 pr-4 font-medium">Confidence</th>
              <th className="py-3 pr-4 font-medium">Peak Acceleration</th>
              <th className="py-3 pr-4 font-medium">Forward Time</th>
              <th className="py-3 pr-4 font-medium">Retraction Time</th>
            </tr>
          </thead>

          <tbody>
            {events.slice(0, 20).map((event, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-600">{index + 1}</td>
                <td className="py-3 pr-4 font-medium text-slate-900">
                  {getPunchType(event)}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(
                    event.hand ||
                      event.punchHand ||
                      event.punch_hand ||
                      event.side
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(
                    event.t || event.time || event.timestamp || event.timeStamp
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(getConfidence(event))}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(getPeakAcceleration(event))}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(getForwardTime(event))}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatValue(getRetractionTime(event))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length > 20 && (
        <p className="mt-3 text-xs text-slate-500">
          Showing first 20 punch events.
        </p>
      )}
    </div>
  );
}

function normaliseMetrics(metrics: unknown): MetricItem[] {
  if (!metrics) return [];

  if (Array.isArray(metrics)) {
    return metrics.map((item, index) => {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;

        return {
          label: String(
            record.label ||
              record.name ||
              record.metric ||
              record.key ||
              `Metric ${index + 1}`
          ),
          value:
            record.value ??
            record.result ??
            record.score ??
            record.amount ??
            JSON.stringify(record),
        };
      }

      return {
        label: `Metric ${index + 1}`,
        value: item,
      };
    });
  }

  if (typeof metrics === "object") {
    return Object.entries(metrics as Record<string, unknown>).map(
      ([key, value]) => ({
        label: key,
        value:
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value,
      })
    );
  }

  return [
    {
      label: "Metrics",
      value: metrics,
    },
  ];
}

function getVideoPunchEvents(
  mlResults: MLResults | null
): Record<string, unknown>[] {
  if (!mlResults) return [];

  if (Array.isArray(mlResults.videoPunchEvents)) {
    return mlResults.videoPunchEvents;
  }

  if (Array.isArray(mlResults.punchEvents)) {
    return mlResults.punchEvents;
  }

  return [];
}

function getVideoEventSeekTime(event: Record<string, unknown>): number | null {
  const value =
    event.t ??
    event.time ??
    event.timestamp ??
    event.timeStamp ??
    event.startTime ??
    event.start_t_s ??
    event.start_time;

  return toNumberOrNull(value);
}

function getVideoEventStartTime(event: Record<string, unknown>): number | null {
  const value =
    event.startTime ??
    event.start_t_s ??
    event.start_time ??
    event.t ??
    event.time;

  return toNumberOrNull(value);
}

function getVideoEventEndTime(event: Record<string, unknown>): number | null {
  const value =
    event.endTime ??
    event.end_t_s ??
    event.end_time ??
    event.t ??
    event.time;

  return toNumberOrNull(value);
}

function getActivePunchIndex(
  events: Record<string, unknown>[],
  currentTime: number
): number | null {
  if (!events.length) return null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const startTime = getVideoEventStartTime(event);
    const endTime = getVideoEventEndTime(event);

    if (startTime === null) continue;

    const safeEndTime =
      endTime !== null && endTime >= startTime ? endTime : startTime + 0.8;

    if (currentTime >= startTime - 0.15 && currentTime <= safeEndTime + 0.15) {
      return index;
    }
  }

  return null;
}

function getPunchType(event: Record<string, unknown>): string {
  return String(
    event.type ||
      event.punchType ||
      event.punch_type ||
      event.label ||
      "Unknown"
  );
}

function getPeakAcceleration(event: Record<string, unknown>): number | null {
  const value =
    event.peakAcceleration ??
    event.peak_acceleration ??
    event.peakAcc ??
    event.maxAcceleration ??
    event.max_acceleration ??
    event.acceleration ??
    event.peak_acc;

  return toNumberOrNull(value);
}

function getConfidence(event: Record<string, unknown>): number | null {
  const value =
    event.confidence ??
    event.probability ??
    event.score ??
    event.modelConfidence ??
    event.model_confidence;

  return toNumberOrNull(value);
}

function getForwardTime(event: Record<string, unknown>): number | null {
  const value =
    event.forwardTime ??
    event.forwardTimeMs ??
    event.forward_time ??
    event.forward_time_ms ??
    event.deliveryTime ??
    event.delivery_time ??
    event.fwd_ms;

  return toNumberOrNull(value);
}

function getRetractionTime(event: Record<string, unknown>): number | null {
  const value =
    event.retractionTime ??
    event.retractionTimeMs ??
    event.retraction_time ??
    event.retraction_time_ms ??
    event.recoveryTime ??
    event.recovery_time ??
    event.ret_ms;

  return toNumberOrNull(value);
}

function buildPunchTypeData(events: Record<string, unknown>[]) {
  const counts: Record<string, number> = {};

  events.forEach((event) => {
    const type = getPunchType(event);
    counts[type] = (counts[type] || 0) + 1;
  });

  return Object.entries(counts).map(([name, value]) => ({
    name,
    value,
  }));
}

function buildAccelerationTrendData(events: Record<string, unknown>[]) {
  return events
    .map((event, index) => {
      const peakAcceleration = getPeakAcceleration(event);

      if (peakAcceleration === null) return null;

      return {
        index: index + 1,
        peakAcceleration,
      };
    })
    .filter(Boolean) as { index: number; peakAcceleration: number }[];
}

function buildConfidenceTrendData(events: Record<string, unknown>[]) {
  return events
    .map((event, index) => {
      const confidence = getConfidence(event);

      if (confidence === null) return null;

      return {
        index: index + 1,
        confidence,
      };
    })
    .filter(Boolean) as { index: number; confidence: number }[];
}

function buildTimingData(events: Record<string, unknown>[]) {
  return events
    .slice(0, 12)
    .map((event, index) => {
      const forwardTime = getForwardTime(event);
      const retractionTime = getRetractionTime(event);

      if (forwardTime === null && retractionTime === null) return null;

      return {
        label: `P${index + 1}`,
        forwardTime: forwardTime || 0,
        retractionTime: retractionTime || 0,
      };
    })
    .filter(Boolean) as {
    label: string;
    forwardTime: number;
    retractionTime: number;
  }[];
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "N/A";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value : value.toFixed(2);
  }

  return String(value);
}