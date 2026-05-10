import { useEffect, useMemo, useState } from "react";
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
            <VideoAnalysisView hasMov={hasMov} videoResult={videoResult} />
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
      description: "Annotated movement review",
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

        <div className="flex min-w-[250px] flex-col items-center text-center">
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
}: {
  hasMov: boolean;
  videoResult: VideoResult | null;
}) {
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 to-purple-900 p-6 text-white">
        <h2 className="text-2xl font-bold">Video Analysis</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-200">
          This section displays the annotated video generated by the Python
          video analysis pipeline.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm">
        <video src={videoUrl} controls className="h-auto w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Video Result" value="Available" />
        <SummaryCard
          title="URL Expiry"
          value={
            videoResult?.expiresIn ? `${videoResult.expiresIn}s` : "N/A"
          }
        />
        <SummaryCard title="Output Type" value="Annotated Video" />
      </div>
    </div>
  );
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
          label:
            String(
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