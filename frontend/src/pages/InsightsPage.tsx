import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Dumbbell,
  Gauge,
  Home,
  PlayCircle,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Video,
  Waves,
  Zap,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type Session = {
  id: string;
  title?: string;
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

type AdvancedInsights = {
  available?: boolean;
  reason?: string;
  summary?: any;
  eventMetrics?: any[];
  cadenceBlocks?: any[];
  punchTypeAverages?: any[];
  coachingInsights?: any[];
  fieldDefinitions?: Record<string, string>;
};

type InsightResult = {
  totalPunches?: number | string;
  punchRate?: string;
  sessionDuration?: string;
  dominantPunch?: string;
  avgConfidence?: string;
  avgPeakAcceleration?: string;
  punchMixInsight?: string;
  recommendations?: string[];
  punchEvents?: any[];
  advancedInsights?: AdvancedInsights | null;
  jabCount?: number;
  hookCount?: number;
  uppercutCount?: number;
};

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
}: {
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

      {data.length > 0 ? (
        <div className="mt-5 space-y-4">
          {data.map((item) => {
            const forwardWidth = `${Math.max(
              (item.forward / maxValue) * 100,
              4
            )}%`;

            const retractionWidth = `${Math.max(
              (item.retraction / maxValue) * 100,
              4
            )}%`;

            return (
              <div key={item.label} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-700">
                    {item.label}
                  </span>
                  <span className="text-gray-500">
                    F {item.forward.toFixed(3)}s / R{" "}
                    {item.retraction.toFixed(3)}s
                  </span>
                </div>

                <div className="mb-3">
                  <div className="mb-1 text-xs text-gray-500">Forward time</div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-purple-600"
                      style={{ width: forwardWidth }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-500">
                    Retraction time
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-purple-300"
                      style={{ width: retractionWidth }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-gray-500">
          Forward/retraction timing data is not available.
        </div>
      )}
    </div>
  );
}

function SnapCards({
  title,
  subtitle,
  events,
}: {
  title: string;
  subtitle?: string;
  events: any[];
}) {
  const topEvents = [...events]
    .filter((event) => Number.isFinite(Number(event.peakJerk)))
    .sort((a, b) => Number(b.peakJerk) - Number(a.peakJerk))
    .slice(0, 5);

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

function EventSnapshotFigure({
  title,
  subtitle,
  events,
}: {
  title: string;
  subtitle?: string;
  events: any[];
}) {
  const samples = events
    .filter(
      (event) =>
        Number.isFinite(Number(event.startTime)) &&
        Number.isFinite(Number(event.peakTime)) &&
        Number.isFinite(Number(event.endTime))
    )
    .slice(0, 3);

  if (samples.length === 0) {
    return (
      <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-gray-500">
          Start / peak / end data is not available.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {samples.map((event, index) => {
          const start = Number(event.startTime);
          const peak = Number(event.peakTime);
          const end = Number(event.endTime);
          const peakAcc = Number(event.peakAcceleration || 1);

          const width = 320;
          const height = 150;
          const padding = 24;
          const span = Math.max(end - start, 0.001);

          const xStart = padding;
          const xPeak = padding + ((peak - start) / span) * (width - padding * 2);
          const xEnd = width - padding;

          const yBase = height - padding;
          const yPeak = padding + 10;

          const curve = `${xStart},${yBase} ${xPeak},${yPeak} ${xEnd},${yBase}`;

          return (
            <div key={`${event.eventId}-${index}`} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-purple-600">
                  #{event.eventId || index + 1} {event.type || "Punch"}
                </span>
                <span className="text-gray-500">
                  {Number.isFinite(peakAcc) ? `${peakAcc.toFixed(2)}g` : "N/A"}
                </span>
              </div>

              <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
                <rect
                  x={xStart}
                  y={yPeak}
                  width={Math.max(xPeak - xStart, 1)}
                  height={yBase - yPeak}
                  fill="#dbeafe"
                  opacity="0.55"
                />

                <rect
                  x={xPeak}
                  y={yPeak}
                  width={Math.max(xEnd - xPeak, 1)}
                  height={yBase - yPeak}
                  fill="#dcfce7"
                  opacity="0.55"
                />

                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={curve}
                />

                <line
                  x1={xStart}
                  x2={xStart}
                  y1={padding}
                  y2={yBase}
                  stroke="#f97316"
                  strokeWidth="3"
                />

                <line
                  x1={xPeak}
                  x2={xPeak}
                  y1={padding}
                  y2={yBase}
                  stroke="#ef4444"
                  strokeWidth="3"
                />

                <line
                  x1={xEnd}
                  x2={xEnd}
                  y1={padding}
                  y2={yBase}
                  stroke="#7c3aed"
                  strokeWidth="3"
                />

                <text x={xStart} y={height - 6} fontSize="10" fill="#f97316">
                  Start
                </text>
                <text
                  x={xPeak}
                  y={height - 6}
                  fontSize="10"
                  fill="#ef4444"
                  textAnchor="middle"
                >
                  Peak
                </text>
                <text
                  x={xEnd}
                  y={height - 6}
                  fontSize="10"
                  fill="#7c3aed"
                  textAnchor="end"
                >
                  End
                </text>
              </svg>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div>Forward: {Number(event.forwardTime || 0).toFixed(3)}s</div>
                <div>
                  Retraction: {Number(event.retractionTime || 0).toFixed(3)}s
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        This figure uses start, peak and end markers returned by the backend.
        It explains the metric concept visually; a true acceleration curve needs
        full signal curve data from the backend.
      </p>
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
                <tr key={`${event.eventId}-${index}`} className="bg-white text-gray-700">
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

  const [pageLoading, setPageLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const [error, setError] = useState("");
  const [videoMessage, setVideoMessage] = useState("");
  const [insightMessage, setInsightMessage] = useState("");

  const pollingRef = useRef<number | null>(null);

  const getToken = () =>
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt");

  const getAuthHeaders = (): HeadersInit => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const readErrorText = async (res: Response) => {
    try {
      return (await res.text()) || res.statusText;
    } catch {
      return res.statusText;
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  };

  const formatSeconds = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(3)}s` : "N/A";
  };

  const formatNumber = (value: any, suffix = "", digits = 2) => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(digits)}${suffix}` : "N/A";
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

    const wrapper = data?.data || data || {};

    return {
      ...(previousSession || {}),
      ...base,
      id: base.id || wrapper.id || previousSession?.id || sessionId,
      title:
        base.title ||
        wrapper.title ||
        previousSession?.title ||
        `Session ${sessionId.slice(0, 8)}`,
      status: base.status || wrapper.status || previousSession?.status || "N/A",
      processingStatus:
        base.processingStatus ||
        wrapper.processingStatus ||
        previousSession?.processingStatus ||
        "N/A",
      canFetchResults:
        base.canFetchResults ??
        wrapper.canFetchResults ??
        previousSession?.canFetchResults,
      csvUploadStatus:
        base.csvUploadStatus ||
        wrapper.csvUploadStatus ||
        previousSession?.csvUploadStatus,
      movUploadStatus:
        base.movUploadStatus ||
        wrapper.movUploadStatus ||
        previousSession?.movUploadStatus,
      sessionDate:
        base.sessionDate || wrapper.sessionDate || previousSession?.sessionDate,
      sessionStartAt:
        base.sessionStartAt ||
        wrapper.sessionStartAt ||
        previousSession?.sessionStartAt,
      createdAt: base.createdAt || wrapper.createdAt || previousSession?.createdAt,
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

    return (
      targetSession.status === "processing" ||
      ["queued", "preprocessing", "inferencing", "processing"].includes(
        targetSession.processingStatus || ""
      )
    );
  };

  const getVideoUrlFromResponse = (data: any) =>
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
    "";

  const normaliseInsights = (data: any): InsightResult => {
    const source = data?.data || data?.result || data?.results || data || {};
    const metricsArray = Array.isArray(source.metrics) ? source.metrics : [];
    const rawPunchEvents = Array.isArray(source.punchEvents)
      ? source.punchEvents
      : [];

    const advancedInsights: AdvancedInsights | null =
      source.advancedInsights ||
      source.advanced_insights ||
      data?.data?.advancedInsights ||
      null;

    const advancedEvents = Array.isArray(advancedInsights?.eventMetrics)
      ? advancedInsights?.eventMetrics || []
      : [];

    const advancedByEventId = new Map<number, any>();

    advancedEvents.forEach((event: any, index: number) => {
      const eventId = Number(event.eventId || index + 1);
      if (Number.isFinite(eventId)) advancedByEventId.set(eventId, event);
    });

    const getMetric = (name: string) => {
      const item = metricsArray.find((metric: any) => metric.name === name);
      return item?.value ?? "N/A";
    };

    const getMetricAny = (names: string[]) => {
      for (const name of names) {
        const value = getMetric(name);
        if (value !== "N/A") return value;
      }
      return "N/A";
    };

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

    const maxCount = Math.max(...counts.map((item) => item.value), 1);
    const minCount = Math.min(...counts.filter((item) => item.value > 0).map((item) => item.value), maxCount);
    const balanceRatio = minCount / maxCount;

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

  const canRunAnalysis = useMemo(() => {
    if (!session) return false;

    return (
      session.status === "ready" &&
      session.csvUploadStatus === "uploaded" &&
      session.movUploadStatus === "uploaded" &&
      !isAnalysisRunning(session) &&
      !isAnalysisFinished(session)
    );
  }, [session]);

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

    const grouped: Record<string, { count: number; forward: number; retraction: number }> =
      {};

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
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl rounded-[32px] bg-white px-8 py-10 shadow-sm">
        <div className="relative mb-10 text-center">
          <button
            onClick={() => navigate("/sessions")}
            className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
          >
            <ArrowLeft size={24} />
          </button>

          <button
            onClick={() => navigate("/home")}
            className="absolute right-0 top-2 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-purple-600 shadow-sm transition hover:bg-purple-50"
          >
            <Home size={22} />
          </button>

          <h1 className="text-5xl font-extrabold text-purple-600">
            Session Insights
          </h1>

          <p className="mt-4 text-lg text-gray-500">
            Review annotated video, punch mechanics, fatigue trends, and
            coaching feedback.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">Session</p>
            <p className="mt-2 break-all text-lg font-bold text-purple-600">
              {session?.title || `Session ${sessionId.slice(0, 8)}`}
            </p>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
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

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-500">ML Status</p>
            <span
              className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(
                session?.processingStatus
              )}`}
            >
              {session?.processingStatus || "N/A"}
            </span>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
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
                Visual replay of detected punch movement.
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
                onClick={loadPage}
                className="flex items-center gap-2 rounded-2xl border border-purple-200 bg-white px-5 py-3 font-semibold text-purple-600 transition hover:bg-purple-50"
              >
                <RefreshCw size={18} />
                Refresh Results
              </button>
            </div>
          </div>

          {videoLoading || pageLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-3xl bg-white">
              <div className="text-center text-gray-500">
                <RefreshCw className="mx-auto mb-4 animate-spin text-purple-600" />
                Loading annotated video...
              </div>
            </div>
          ) : videoUrl ? (
            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-black">
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                preload="metadata"
                className="h-auto w-full"
              />
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white">
              <div className="max-w-md text-center">
                <Video className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-lg font-semibold text-gray-700">
                  Annotated video not available yet
                </p>
                <p className="mt-2 text-gray-500">
                  {videoMessage ||
                    "The annotated video will appear after processing is completed."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="text-purple-600" size={26} />
              <div>
                <h2 className="text-2xl font-bold text-purple-600">
                  Insights Dashboard
                </h2>
                <p className="mt-1 text-gray-500">
                  Six key visuals for end-user understanding.
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

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
              />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DonutChart
              title="Punch Type Distribution"
              subtitle="Shows number of jabs, hooks and uppercuts."
              totalLabel="Total"
              totalValue={insights?.totalPunches || 0}
              items={donutItems}
              insight={insights?.punchMixInsight}
            />

            <GroupedBarChart
              title="Forward vs Retraction Time"
              subtitle="Shows punch delivery speed and recovery speed."
              data={groupedTimingData}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LineChart
              title="Peak Acceleration Trend"
              subtitle="Shows whether punch power increases or decreases across the session."
              data={peakAccelerationTrend}
              unit="g"
            />

            <SnapCards
              title="Top 5 Sharpest Punches"
              subtitle="Higher snap means a sharper strike."
              events={advancedEvents}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LineChart
              title="Retraction Acceleration / Fatigue Trend"
              subtitle="Shows whether recovery speed decreases later in the session."
              data={retractionFatigueTrend}
              unit="g"
            />

            <CoachingCards
              items={
                coachingInsights.length > 0
                  ? coachingInsights
                  : insights?.recommendations?.map((message) => ({
                      title: "Coaching Note",
                      message,
                      severity: "info",
                    })) || []
              }
            />
          </div>

          <div className="mt-6">
            <EventSnapshotFigure
              title="Punch Event Snapshot Figure"
              subtitle="Explains start, peak, end, forward time and retraction time visually."
              events={eventTableData}
            />
          </div>

          <div className="mt-6">
            <EventTable events={eventTableData} />
          </div>

          <div className="mt-6 rounded-3xl border border-purple-100 bg-purple-50 p-5 text-purple-700">
            <p className="font-semibold">How to use these insights</p>
            <p className="mt-1">
              Start with the summary cards and punch mix. Then review forward
              time, retraction time, acceleration, snap and fatigue trends
              together with the annotated video.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}