import { useEffect, useState } from "react";
import type { FrontendDemoResults } from "../types/boxing";

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-gray-900">{children}</h2>;
}

function formatNumber(value: unknown, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return "N/A";
  }
  return Number(value).toFixed(digits);
}

export default function InsightsDemoPage() {
  const [data, setData] = useState<FrontendDemoResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/demo/frontend_demo_results.json")
      .then((res) => res.json())
      .then((json) => {
        console.log("demo json:", json);
        setData(json);
      })
      .catch((err) => console.error("Failed to load demo results:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-600">Loading session insights...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-500">Failed to load demo data.</div>;
  }

  const {
    summary,
    typeDistribution,
    typeSummary,
    phaseSummary,
    recommendations,
  } = data;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Session Insights</h1>
          <p className="mt-2 text-gray-600">Session ID: {data.sessionId}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Punches" value={summary.totalPunches ?? "N/A"} />
          <StatCard
            title="Punches / Minute"
            value={formatNumber(summary.punchesPerMinute, 2)}
          />
          <StatCard
            title="Active Duration (s)"
            value={formatNumber(summary.activeDurationSec, 2)}
          />
          <StatCard title="Dominant Type" value={summary.dominantType ?? "N/A"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Type Distribution</SectionTitle>
            <div className="mt-4 space-y-3">
              {Object.entries(typeDistribution ?? {}).map(([type, count]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{type}</span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-gray-900"
                      style={{
                        width:
                          summary.totalPunches && Number(count) >= 0
                            ? `${(Number(count) / Number(summary.totalPunches)) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Recommendations</SectionTitle>
            <div className="mt-4 space-y-3">
              {(recommendations ?? []).map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle>Performance by Punch Type</SectionTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Count</th>
                  <th className="px-3 py-2">Avg Peak Acc</th>
                  <th className="px-3 py-2">Avg Peak Rotation</th>
                  <th className="px-3 py-2">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {(typeSummary ?? []).map((item: any) => (
                  <tr key={item.type} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.type}
                    </td>
                    <td className="px-3 py-2">{item.count ?? "N/A"}</td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_peak_acc, 2)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_peak_rotation, 2)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_duration, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle>Performance by Session Phase</SectionTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="px-3 py-2">Phase</th>
                  <th className="px-3 py-2">Punches</th>
                  <th className="px-3 py-2">Avg Peak Acc</th>
                  <th className="px-3 py-2">Avg Peak Rotation</th>
                  <th className="px-3 py-2">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {(phaseSummary ?? []).map((item: any) => (
                  <tr key={item.phase} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.phase}
                    </td>
                    <td className="px-3 py-2">{item.punches ?? "N/A"}</td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_peak_acc, 2)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_peak_rotation, 2)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(item.avg_duration, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Type Distribution Chart</SectionTitle>
            <img
              src="/demo/type_distribution.png"
              alt="Type distribution"
              className="mt-4 w-full rounded-xl"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Cadence by Time Block</SectionTitle>
            <img
              src="/demo/cadence_blocks.png"
              alt="Cadence blocks"
              className="mt-4 w-full rounded-xl"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Peak Acceleration Trend</SectionTitle>
            <img
              src="/demo/peak_acc_trend.png"
              alt="Peak acceleration trend"
              className="mt-4 w-full rounded-xl"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle>Peak Rotation Trend</SectionTitle>
            <img
              src="/demo/rotation_trend.png"
              alt="Peak rotation trend"
              className="mt-4 w-full rounded-xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}