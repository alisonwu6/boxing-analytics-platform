import { useEffect, useMemo, useRef, useState } from "react";
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

type Session = {
type Session = {
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
  value: any;
  note?: string;
  icon: any;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5 shadow-sm">
      <Icon className="mb-3 text-purple-600" size={24} />
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-800">{value}</p>
      {note && <p className="mt-2 text-xs leading-5 text-gray-500">{note}</p>}
    </div>
  );
}

function DonutChart({
  title,
  subtitle,
  totalLabel,
  totalValue,
  items,
  insight,
}: {
  title: string;
  subtitle?: string;
  totalLabel: string;
  totalValue: string | number;
  insight?: string;
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let start = 0;

  const gradient = items
    .map((item) => {
      const deg = total > 0 ? (item.value / total) * 360 : 0;
      const segment = `${item.color} ${start}deg ${start + deg}deg`;
      start += deg;
      return segment;
    })
    .join(", ");

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}

      <div className="mt-6 flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
        <div className="relative flex h-56 w-56 items-center justify-center">
          <div
            className="h-56 w-56 rounded-full shadow-inner"
            style={{
              background:
                total > 0
                  ? `conic-gradient(${gradient})`
                  : "conic-gradient(#e5e7eb 0deg 360deg)",
            }}
          />

          <div className="absolute flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {totalLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-purple-600">
              {totalValue}
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {items.map((item) => {
            const pct =
              total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-gray-700">
                    {item.label}
                  </span>
                </div>

                <div className="text-right">
                  <p className="font-bold text-purple-600">{item.value}</p>
                  <p className="text-xs text-gray-500">{pct}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {insight && (
        <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-purple-700 shadow-sm">
          {insight}
        </div>
      )}
    </div>
  );
}

function LineChart({
  title,
  subtitle,
  data,
  unit = "",
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  unit?: string;
}) {
  const clean = data.filter((item) => Number.isFinite(item.value));

  if (clean.length === 0) {
    return (
      <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-gray-500">
          Data is not available.
        </div>
      </div>
    );
  }

  const width = 620;
  const height = 240;
  const padding = 36;

  const maxValue = Math.max(...clean.map((item) => item.value), 1);
  const minValue = Math.min(...clean.map((item) => item.value), 0);

  const points = clean.map((item, index) => {
    const x =
      clean.length === 1
        ? width / 2
        : padding + (index / (clean.length - 1)) * (width - padding * 2);

    const normalized =
      maxValue === minValue
        ? 0.5
        : (item.value - minValue) / (maxValue - minValue);

    const y = height - padding - normalized * (height - padding * 2);

    return { ...item, x, y };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}

      <div className="mt-5 overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px]">
          {[0, 1, 2, 3].map((line) => {
            const y = padding + ((height - padding * 2) / 3) * line;

            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 4"
              />
            );
          })}

          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#7c3aed"
              strokeWidth="4"
              points={polyline}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              <circle cx={point.x} cy={point.y} r="6" fill="#7c3aed" />
              <circle
                cx={point.x}
                cy={point.y}
                r="12"
                fill="#7c3aed"
                opacity="0.12"
              />

              <text
                x={point.x}
                y={point.y - 14}
                textAnchor="middle"
                fontSize="11"
                fill="#7c3aed"
                fontWeight="700"
              >
                {point.value.toFixed(1)}
                {unit}
              </text>

              <text
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {point.label.length > 8
                  ? `${point.label.slice(0, 7)}…`
                  : point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function GroupedBarChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; forward: number; retraction: number }[];
}) {
  const maxValue = Math.max(
    ...data.flatMap((item) => [item.forward, item.retraction]),
    1
  );

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}

      {topEvents.length > 0 ? (
        <div className="mt-5 space-y-3">
          {topEvents.map((event, index) => (
            <div
              key={`${event.eventId}-${index}`}
              className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
            >
              <div>
                <p className="font-semibold text-gray-800">
                  #{event.eventId || index + 1} {event.type || "Punch"}
                </p>
                <p className="text-xs text-gray-500">
                  Higher snap means a sharper strike.
                </p>
              </div>

              <div className="text-right">
                <p className="text-xl font-bold text-purple-600">
                  {Number(event.peakJerk).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">g/s</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-gray-500">
          Punch snap data is not available.
        </div>
      )}
    </div>
  );
}

function CoachingCards({
  items,
}: {
  items: { title?: string; message?: string; severity?: string }[];
}) {
  const getClass = (severity?: string) => {
    if (severity === "positive") {
      return "border-green-100 bg-green-50 text-green-800";
    }

    if (severity === "warning") {
      return "border-yellow-100 bg-yellow-50 text-yellow-800";
    }

    return "border-purple-100 bg-purple-50 text-purple-800";
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle className="text-purple-600" size={22} />
        <h3 className="text-xl font-bold text-gray-800">Coaching Insights</h3>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className={`rounded-2xl border p-4 ${getClass(item.severity)}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">
                  {item.title || `Insight ${index + 1}`}
                </p>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                  {item.severity || "info"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6">
                {item.message || "No message available."}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 text-sm text-gray-500">
          Coaching insights are not available.
        </div>
      )}
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
  const getClass = (severity?: string) => {
    if (severity === "positive") {
      return "border-green-100 bg-green-50 text-green-800";
    }

    if (severity === "warning") {
      return "border-yellow-100 bg-yellow-50 text-yellow-800";
    }

    return "border-purple-100 bg-purple-50 text-purple-800";
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle className="text-purple-600" size={22} />
        <h3 className="text-xl font-bold text-gray-800">Coaching Insights</h3>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className={`rounded-2xl border p-4 ${getClass(item.severity)}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">
                  {item.title || `Insight ${index + 1}`}
                </p>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                  {item.severity || "info"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6">
                {item.message || "No message available."}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 text-sm text-gray-500">
          Coaching insights are not available.
        </div>
      )}
    </div>
  );
}

function EventTable({ events }: { events: any[] }) {
  const formatSeconds = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(3)}s` : "N/A";
  };

  const formatNumber = (value: any, suffix = "", digits = 2) => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(digits)}${suffix}` : "N/A";
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <h3 className="text-xl font-bold text-gray-800">Event-Level Table</h3>
      <p className="mt-2 text-sm text-gray-500">
        Detailed punch-by-punch review for users who want deeper analysis.
      </p>

      {events.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="px-4 py-2">Punch Type</th>
                <th className="px-4 py-2">Start</th>
                <th className="px-4 py-2">Peak</th>
                <th className="px-4 py-2">End</th>
                <th className="px-4 py-2">Forward</th>
                <th className="px-4 py-2">Retraction</th>
                <th className="px-4 py-2">Peak Acc</th>
                <th className="px-4 py-2">Snap / Jerk</th>
                <th className="px-4 py-2">Rotation</th>
              </tr>
            </thead>

            <tbody>
              {events.slice(0, 20).map((event, index) => (
                <tr
                  key={`${event.eventId}-${index}`}
                  className="bg-white text-gray-700"
                >
                  <td className="rounded-l-2xl px-4 py-3 font-semibold text-purple-600">
                    {event.type || "Unknown"}
                  </td>
                  <td className="px-4 py-3">{formatSeconds(event.startTime)}</td>
                  <td className="px-4 py-3">{formatSeconds(event.peakTime)}</td>
                  <td className="px-4 py-3">{formatSeconds(event.endTime)}</td>
                  <td className="px-4 py-3">{formatSeconds(event.forwardTime)}</td>
                  <td className="px-4 py-3">
                    {formatSeconds(event.retractionTime)}
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(event.peakAcceleration, "g", 2)}
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(event.peakJerk, "g/s", 2)}
                  </td>
                  <td className="rounded-r-2xl px-4 py-3">
                    {formatNumber(event.peakRotation, " deg/s", 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-gray-500">
          Event-level data is not available.
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = params.sessionId || params.id || "";

  const [session, setSession] = useState<Session | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [insights, setInsights] = useState<InsightResult | null>(null);

  const activePunch =
    displayActiveIndex !== null ? videoPunchEvents[displayActiveIndex] : null;

  function handlePunchClick(index: number) {
    const event = videoPunchEvents[index];
    const seekTime = getVideoEventSeekTime(event);

    if (seekTime === null) return;

    setSelectedPunchIndex(index);

    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(seekTime - 0.35, 0);
      videoRef.current.play().catch(() => {
        // Browser may block autoplay.
      });
    }
  }

  function handleTimeUpdate() {
    if (!videoRef.current) return;

    const toNumber = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    const jabCount = toNumber(
      getMetricAny(["count_Jab", "count_jab", "jabCount"])
    );
    const hookCount = toNumber(
      getMetricAny(["count_Hook", "count_hook", "hookCount"])
    );
    const uppercutCount = toNumber(
      getMetricAny(["count_Uppercut", "count_uppercut", "uppercutCount"])
    );

    const counts = [
      { type: "Jab", value: jabCount },
      { type: "Hook", value: hookCount },
      { type: "Uppercut", value: uppercutCount },
    ];

    const dominant = [...counts].sort((a, b) => b.value - a.value)[0];

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

    const sortedEvents = [...rawPunchEvents]
      .map((event: any, index: number) => {
        const eventId = Number(event.eventId || index + 1);
        const advanced = advancedByEventId.get(eventId) || {};

        return {
          ...event,
          eventId,
          startTime: event.startTime ?? advanced.startTime,
          peakTime: event.peakTime ?? advanced.peakTime,
          endTime: event.endTime ?? advanced.endTime,
          forwardTime: event.forwardTime ?? advanced.forwardTime,
          retractionTime: event.retractionTime ?? advanced.retractionTime,
          peakAcceleration:
            event.peakAcceleration ?? advanced.peakAcceleration,
          peakJerk: event.peakJerk ?? advanced.peakJerk,
          avgRetractionAcceleration:
            event.avgRetractionAcceleration ??
            advanced.avgRetractionAcceleration,
          peakRotation: event.peakRotation ?? advanced.peakRotation,
        };
      })
      .sort((a, b) => {
        const timeA = Number(a.t || a.time || a.timestamp || 0);
        const timeB = Number(b.t || b.time || b.timestamp || 0);
        return timeA - timeB;
      });

    const confidenceValues = sortedEvents
      .map((event: any) => Number(event.confidence))
      .filter((value) => Number.isFinite(value));

    const avgConfidenceNumber =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, value) => sum + value, 0) /
          confidenceValues.length
        : 0;

    const activeCounts = counts.filter((item) => item.value > 0);
    const maxCount = Math.max(...counts.map((item) => item.value), 1);
    const minCount =
      activeCounts.length > 0
        ? Math.min(...activeCounts.map((item) => item.value))
        : 0;

    const balanceRatio = maxCount > 0 ? minCount / maxCount : 0;

    const punchMixInsight =
      balanceRatio >= 0.7
        ? "The punch mix was balanced."
        : `${dominant.type} was the dominant punch type in this session.`;

    return {
      totalPunches,
      punchRate:
        punchesPerMinute !== "N/A"
          ? `${Number(punchesPerMinute).toFixed(2)} punches/min`
          : "N/A",
      sessionDuration:
        sessionDurationSecs !== "N/A"
          ? `${Number(sessionDurationSecs).toFixed(1)} sec`
          : "N/A",
      dominantPunch: dominant?.type || "N/A",
      avgConfidence:
        confidenceValues.length > 0
          ? `${(avgConfidenceNumber * 100).toFixed(1)}%`
          : "N/A",
      avgPeakAcceleration: formatNumber(
        advancedInsights?.summary?.averagePeakAcceleration,
        "g",
        2
      ),
      punchMixInsight,
      jabCount,
      hookCount,
      uppercutCount,
      recommendations: [
        punchMixInsight,
        "Use the video together with the timing and acceleration charts to review punch quality.",
        "Higher snap means a sharper strike, while slower retraction may indicate delayed recovery back to guard.",
      ],
      punchEvents: sortedEvents,
      advancedInsights,
    };
  };

  const loadSessionDetail = async () => {
    if (!sessionId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "GET",
        headers: { ...getAuthHeaders() },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return null;
      }

      if (!res.ok) return null;

      const data = await res.json();
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
        headers: { ...getAuthHeaders() },
      });

      if (res.status === 401) {
        setError("Unauthorized. Please login again.");
        return previous || null;
      }

      if (!res.ok) return previous || null;

      const data = await res.json();
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

    const hasMov =
      currentSession?.movUploadStatus === "uploaded" ||
      Boolean(currentSession?.movKey) ||
      Boolean(currentSession?.movFile);

    if (!hasMov) {
      setVideoUrl("");
      setVideoMessage(
        "No MOV file was uploaded for this session. CSV insights are available, but annotated video is not available."
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
          headers: { ...getAuthHeaders() },
        }
      );

      if (res.status === 404) {
        setVideoUrl("");
        setVideoMessage(
          "Analysis completed, but no annotated video was returned for this session."
        );
        return;
      }

      if (res.status === 409) {
        setVideoUrl("");
        setVideoMessage(
          "Video is still being prepared. Please refresh results in a moment."
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
      const url = getVideoUrlFromResponse(data);

      if (!url) {
        setVideoUrl("");
        setVideoMessage("Backend did not return a video URL.");
        return;
      }

      setVideoUrl(url);
      setVideoMessage("");
    } catch (err) {
      console.error("[VIDEO] could not load annotated video:", err);
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
        headers: { ...getAuthHeaders() },
      });

      if (res.status === 409) {
        setInsightMessage("Analysis is still processing.");
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
      console.warn("Could not load insight results:", err);
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
      setInsightMessage("Analysis failed.");
      setVideoMessage("Analysis failed, so annotated video is not available.");
      setInsights(normaliseInsights({}));
      return;
    }

    setInsightMessage("Analysis is still processing.");
    setVideoMessage("Annotated video will appear after processing.");
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

      if (isAnalysisFinished(currentSession) || isAnalysisFailed(currentSession)) {
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
      setError("Could not load insights page.");
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
      setInsightMessage("");
      setVideoMessage("");

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

      if (!res.ok && res.status !== 409) {
        const text = await readErrorText(res);
        setError(`Could not start analysis: ${res.status} ${text}`);
        return;
      }

      const currentSession = await loadSessionStatus(session);
      setInsightMessage("Analysis has started.");
      if (currentSession) startPolling();
    } catch (err) {
      console.error(err);
      setError("Could not start analysis.");
    } finally {
      setAnalyzeLoading(false);
    }
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

  const hasCsvUploaded =
    session?.csvUploadStatus === "uploaded" ||
    Boolean(session?.csvKey) ||
    Boolean(session?.csvFile);

  const hasMovUploaded =
    session?.movUploadStatus === "uploaded" ||
    Boolean(session?.movKey) ||
    Boolean(session?.movFile);

  const canRunAnalysis = useMemo(() => {
    if (!session) return false;

    const hasCsv =
      session.csvUploadStatus === "uploaded" ||
      Boolean(session.csvKey) ||
      Boolean(session.csvFile);

    return (
      session.status === "ready" &&
      hasCsv &&
      !isAnalysisRunning(session) &&
      !isAnalysisFinished(session)
    );
  }, [session]);

  const analysisButtonLabel =
    hasCsvUploaded && hasMovUploaded
      ? "Run Full Analysis"
      : hasCsvUploaded
      ? "Run CSV Insights"
      : "CSV Required";

  const advanced = insights?.advancedInsights;
  const advancedEvents = Array.isArray(advanced?.eventMetrics)
    ? advanced?.eventMetrics || []
    : [];

  const punchTypeAverages = Array.isArray(advanced?.punchTypeAverages)
    ? advanced?.punchTypeAverages || []
    : [];

  const coachingInsights = Array.isArray(advanced?.coachingInsights)
    ? advanced?.coachingInsights || []
    : [];

  const summaryCards = [
    {
      label: "Total Punches",
      value: insights?.totalPunches ?? "N/A",
      icon: Dumbbell,
    },
    {
      label: "Punch Rate",
      value: insights?.punchRate ?? "N/A",
      icon: Zap,
    },
    {
      label: "Session Duration",
      value: insights?.sessionDuration ?? "N/A",
      icon: Timer,
    },
    {
      label: "Dominant Punch",
      value: insights?.dominantPunch ?? "N/A",
      icon: Target,
    },
    {
      label: "Average Confidence",
      value: insights?.avgConfidence ?? "N/A",
      icon: ShieldCheck,
    },
    {
      label: "Avg Peak Acceleration",
      value: insights?.avgPeakAcceleration ?? "N/A",
      icon: Gauge,
    },
  ];

  const donutItems = [
    {
      label: "Jab",
      value: Number(insights?.jabCount || 0),
      color: "#8b5cf6",
    },
    {
      label: "Hook",
      value: Number(insights?.hookCount || 0),
      color: "#c084fc",
    },
    {
      label: "Uppercut",
      value: Number(insights?.uppercutCount || 0),
      color: "#ddd6fe",
    },
  ];

  const groupedTimingData = (() => {
    if (punchTypeAverages.length > 0) {
      return punchTypeAverages.map((item: any) => ({
        label: item.type || "Unknown",
        forward: Number(item.avgForwardTime) || 0,
        retraction: Number(item.avgRetractionTime) || 0,
      }));
    }

    const grouped: Record<
      string,
      { count: number; forward: number; retraction: number }
    > = {};

    advancedEvents.forEach((event: any) => {
      const type = event.type || "Unknown";
      if (!grouped[type]) {
        grouped[type] = { count: 0, forward: 0, retraction: 0 };
      }

      grouped[type].count += 1;
      grouped[type].forward += Number(event.forwardTime) || 0;
      grouped[type].retraction += Number(event.retractionTime) || 0;
    });

    return Object.entries(grouped).map(([label, value]) => ({
      label,
      forward: value.count ? value.forward / value.count : 0,
      retraction: value.count ? value.retraction / value.count : 0,
    }));
  })();

  const peakAccelerationTrend = advancedEvents
    .filter((event: any) => Number.isFinite(Number(event.peakAcceleration)))
    .slice(0, 20)
    .map((event: any, index: number) => ({
      label: `#${event.eventId || index + 1}`,
      value: Number(event.peakAcceleration),
    }));

  const retractionFatigueTrend = advancedEvents
    .filter((event: any) =>
      Number.isFinite(Number(event.avgRetractionAcceleration))
    )
    .slice(0, 20)
    .map((event: any, index: number) => ({
      label: `#${event.eventId || index + 1}`,
      value: Number(event.avgRetractionAcceleration),
    }));

  const eventTableData =
    advancedEvents.length > 0 ? advancedEvents : insights?.punchEvents || [];

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