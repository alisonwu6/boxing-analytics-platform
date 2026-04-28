"""Wrist punch detection using linear acceleration (gravity-removed)."""

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

from .imu import IMUData


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class PunchEvent:
    hand:           str    # "R" or "L"
    time_s:         float  # peak impact timestamp (IMU clock, seconds)
    peak_g:         float  # peak lin_acc magnitude at impact (g)
    dur_s:          float  # duration above threshold (s)
    punch_type:     str    # see _classify_punch() for possible values
    dominant_axis:  str    # "X", "Y", or "Z" — axis carrying most energy
    axis_ratio:     float  # dominant_axis |value| / total magnitude
    peak_gyro_degs: float  # peak gyro magnitude (°/s) in window near impact


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class WristPunchDetector:
    """Detects and classifies wrist punch events from IMU linear acceleration."""

    IMPACT_THR    = 2.0    # g    — enter candidate window above this
    STRONG_THR    = 3.0    # g    — window peak must reach this
    MIN_DUR       = 0.02   # s    — minimum impact duration (20 ms)
    MIN_GAP       = 0.30   # s    — minimum gap between successive punches
    AXIS_RATIO    = 0.55   # —    — dominant axis must be ≥55% of magnitude
    GYRO_THR      = 150.0  # °/s  — minimum total gyro magnitude near impact (Stage 3)
    GYRO_WIN      = 0.05   # s    — ±window around peak for gyro search
    SEC_RATIO_THR  = 0.30   # —    — secondary axis ratio threshold (right hand)
    LAY_HOOK_THR   = -2.0  # g
    HOOK_GZ_THR_L  = 300.0  # °/s

    def __init__(self,
                 impact_thr:    float = IMPACT_THR,
                 strong_thr:    float = STRONG_THR,
                 min_dur:       float = MIN_DUR,
                 min_gap:       float = MIN_GAP,
                 axis_ratio:    float = AXIS_RATIO,
                 gyro_thr:      float = GYRO_THR,
                 gyro_win:      float = GYRO_WIN,
                 sec_ratio_thr:  float = SEC_RATIO_THR,
                 lay_hook_thr:   float = LAY_HOOK_THR,
                 hook_gz_thr_l:  float = HOOK_GZ_THR_L):
        self.impact_thr    = impact_thr
        self.strong_thr    = strong_thr
        self.min_dur       = min_dur
        self.min_gap       = min_gap
        self.axis_ratio    = axis_ratio
        self.gyro_thr      = gyro_thr
        self.gyro_win      = gyro_win
        self.sec_ratio_thr = sec_ratio_thr
        self.lay_hook_thr  = lay_hook_thr
        self.hook_gz_thr_l = hook_gz_thr_l

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, imu: IMUData,
               t_start: float = 0.0,
               t_end:   Optional[float] = None) -> List[PunchEvent]:
        """
        Detect and classify punch events in [t_start, t_end].

        Parameters
        ----------
        imu     : IMUData with lin_acc_magnitude, lin_acc_x/y/z, gyro_x/y/z
        t_start : start of analysis window (IMU seconds)
        t_end   : end of analysis window (IMU seconds); None = full signal

        Returns
        -------
        List[PunchEvent] sorted by time_s.
        """
        ts  = imu.timestamps
        mag = imu.lin_acc_magnitude

        if mag is None or np.all(mag == 0):
            print(f"[WristPunchDetector] {imu.label}: no linear accel data — "
                  "punch detection skipped.")
            return []

        hand = "R" if imu.label.upper().endswith("R") else "L"

        mask = ts >= t_start
        if t_end is not None:
            mask &= ts <= t_end
        ts_w        = ts[mask]
        mag_w       = mag[mask]
        idx_offset  = int(np.where(mask)[0][0])

        if len(ts_w) == 0:
            return []

        fs              = imu.fs
        min_dur_samples = max(1, int(self.min_dur * fs))

        gyro_mag = np.sqrt(imu.gyro_x**2 + imu.gyro_y**2 + imu.gyro_z**2)
        gz_abs   = np.abs(imu.gyro_z)

        candidates = self._find_windows(mag_w, min_dur_samples)

        events:   List[PunchEvent]         = []
        rejected: List[Tuple[float, str]]  = []

        for (i, j) in candidates:
            peak_g = float(mag_w[i:j].max())

            if peak_g < self.strong_thr:
                t_cand = float(ts_w[i + int(mag_w[i:j].argmax())])
                rejected.append((t_cand,
                    f"weak peak {peak_g:.2f}g < {self.strong_thr}g"))
                continue

            peak_local = int(mag_w[i:j].argmax())
            peak_idx_w = i + peak_local
            peak_idx   = idx_offset + peak_idx_w
            t_peak     = float(ts_w[peak_idx_w])

            ax_ratio, dom_axis, lax, lay, laz = self._axis_dominance(
                imu, peak_idx)
            if ax_ratio < self.axis_ratio:
                rejected.append((t_peak,
                    f"low axis dominance {ax_ratio:.2f} < {self.axis_ratio} "
                    f"(dom={dom_axis})"))
                continue

            peak_gyro = self._gyro_near_peak(gyro_mag, ts, t_peak)
            if peak_gyro < self.gyro_thr:
                rejected.append((t_peak,
                    f"low gyro {peak_gyro:.0f}°/s < {self.gyro_thr:.0f}°/s"))
                continue

            gz_peak = self._gyro_near_peak(gz_abs, ts, t_peak)

            punch_type, reject_reason = self._classify_punch(
                hand, dom_axis, lax, lay, laz, gz_peak)
            if reject_reason:
                rejected.append((t_peak, reject_reason))
                continue

            events.append(PunchEvent(
                hand           = hand,
                time_s         = t_peak,
                peak_g         = peak_g,
                dur_s          = (j - i) / fs,
                punch_type     = punch_type,
                dominant_axis  = dom_axis,
                axis_ratio     = ax_ratio,
                peak_gyro_degs = peak_gyro,
            ))

        events.sort(key=lambda e: e.time_s)
        events = self._apply_min_gap(events)

        self._print_report(imu.label, hand, events, rejected)
        return events

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _find_windows(self, mag_w: np.ndarray,
                      min_dur_samples: int) -> List[Tuple[int, int]]:
        """Return (start, end) index pairs of runs above IMPACT_THR."""
        above   = mag_w > self.impact_thr
        windows = []
        i = 0
        while i < len(above):
            if not above[i]:
                i += 1
                continue
            j = i
            while j < len(above) and above[j]:
                j += 1
            if (j - i) >= min_dur_samples:
                windows.append((i, j))
            i = j
        return windows

    def _axis_dominance(self, imu: IMUData,
                        peak_idx: int
                        ) -> Tuple[float, str, float, float, float]:
        """
        Returns (ratio, axis_label, lax, lay, laz) at peak_idx.
        ratio = |dominant| / magnitude.
        """
        lax = float(imu.lin_acc_x[peak_idx]) if imu.lin_acc_x is not None else 0.0
        lay = float(imu.lin_acc_y[peak_idx])
        laz = float(imu.lin_acc_z[peak_idx]) if imu.lin_acc_z is not None else 0.0

        vals = [abs(lax), abs(lay), abs(laz)]
        mag  = np.sqrt(lax**2 + lay**2 + laz**2)
        if mag < 1e-6:
            return 0.0, "?", lax, lay, laz

        dom_i = int(np.argmax(vals))
        ratio = vals[dom_i] / mag
        return ratio, ["X", "Y", "Z"][dom_i], lax, lay, laz

    def _classify_punch(self, hand: str, dom_axis: str,
                        lax: float, lay: float, laz: float,
                        gz_peak: float,
                        ) -> Tuple[str, Optional[str]]:
        if dom_axis == "Y" and lay > 0:
            return "", f"retraction/guard (+Y, lay={lay:+.2f}g)"

        vals = [abs(lax), abs(lay), abs(laz)]
        mag  = np.sqrt(lax**2 + lay**2 + laz**2)
        if mag < 1e-6:
            return "", "near-zero magnitude at peak"
        sec_ratio = sorted(vals, reverse=True)[1] / mag

        if hand == "R":
            if sec_ratio < self.sec_ratio_thr:
                return "straight", None
            elif lay < self.lay_hook_thr:
                return "hook", None
            else:
                return "uppercut", None
        else:
            if laz > 0:
                return "straight", None
            elif gz_peak < self.hook_gz_thr_l:
                return "uppercut", None
            else:
                return "hook", None

    def _gyro_near_peak(self, gyro_mag: np.ndarray,
                        ts: np.ndarray, t_peak: float) -> float:
        """Peak gyro magnitude (°/s) in [t_peak − GYRO_WIN, t_peak + GYRO_WIN]."""
        lo = np.searchsorted(ts, t_peak - self.gyro_win)
        hi = np.searchsorted(ts, t_peak + self.gyro_win)
        if lo >= hi:
            return 0.0
        return float(gyro_mag[lo:hi].max())

    def _apply_min_gap(self, events: List[PunchEvent]) -> List[PunchEvent]:
        """Keep stronger punch when two confirmed events are < MIN_GAP apart."""
        filtered: List[PunchEvent] = []
        for ev in events:
            if filtered and (ev.time_s - filtered[-1].time_s) < self.min_gap:
                if ev.peak_g > filtered[-1].peak_g:
                    filtered[-1] = ev
            else:
                filtered.append(ev)
        return filtered

    def _print_report(self, label: str, hand: str,
                      events:   List[PunchEvent],
                      rejected: List[Tuple[float, str]]) -> None:
        # Count by type
        from collections import Counter
        type_counts = Counter(e.punch_type for e in events)
        type_str = "  ".join(f"{t}:{n}" for t, n in sorted(type_counts.items()))

        print(f"\n[WristPunchDetector] {label} ({hand} hand): "
              f"{len(events)} punches confirmed, "
              f"{len(rejected)} candidates rejected")
        if type_str:
            print(f"  Types — {type_str}")

        if rejected:
            print("  Rejected candidates:")
            for t, reason in sorted(rejected):
                print(f"    t={t:.3f}s — {reason}")

        if events:
            print("  Confirmed punches:")
            for ev in events:
                print(f"    t={ev.time_s:.3f}s  {ev.peak_g:.2f}g  "
                      f"{ev.punch_type:<14}  "
                      f"axis={ev.dominant_axis}({ev.axis_ratio:.0%})  "
                      f"gyro={ev.peak_gyro_degs:.0f}°/s  "
                      f"dur={ev.dur_s*1000:.0f}ms")
