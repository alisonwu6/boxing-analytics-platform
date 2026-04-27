export type PunchType = "Jab" | "Hook" | "Uppercut";

export interface SessionSummary {
  totalPunches: number;
  activeDurationSec: number;
  punchesPerMinute: number;
  dominantType: PunchType;
}

export interface TypeDistribution {
  Jab: number;
  Hook: number;
  Uppercut: number;
}

export interface TypeSummaryItem {
  type: PunchType;
  count: number;
  avgPeakAcc: number;
  avgPeakRotation: number;
  avgDuration: number;
}

export interface PhaseSummaryItem {
  phase: string;
  punches: number;
  avgPeakAcc: number;
  avgPeakRotation: number;
  avgDuration: number;
}

export interface EventItem {
  eventId: number;
  typePred: PunchType;
  startTime: number;
  peakTime: number;
  endTime: number;
  peakAcc: number;
  peakJerk: number;
  peakRotation: number;
  duration: number;
  timeBlock: string;
}

export interface FrontendDemoResults {
  sessionId: string;
  summary: SessionSummary;
  typeDistribution: TypeDistribution;
  typeSummary: TypeSummaryItem[];
  phaseSummary: PhaseSummaryItem[];
  recommendations: string[];
  events?: EventItem[];
}