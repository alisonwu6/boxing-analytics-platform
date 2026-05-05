from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

# reuse imu loader from the existing boxing_analytics package
try:
    from boxing_analytics.core.imu import IMUData, IMUProcessor
except ImportError:
    from ..boxing_analytics.core.imu import IMUData, IMUProcessor


@dataclass
class JumpEvent:
    source:    str
    time_s:    float
    dur_s:     float
    height_cm: float
    conf:      float


@dataclass
class SyncResult:
    offset_R:     float
    offset_L:     float
    video_jumps:  List[JumpEvent]
    imu_r_jumps:  List[JumpEvent]
    imu_l_jumps:  List[JumpEvent]
    cc_offset_R:  float = 0.0
    cc_offset_L:  float = 0.0
    inter_sensor: float = 0.0


G = 9.81
VID_MIN_GAP_S  = 2.5
VID_PROMINENCE = 0.3
IMU_FF_THR     = 0.55   # g — free-fall threshold
IMU_FF_MIN_DUR = 0.10
IMU_STRONG_THR = 0.25


def _gauss(x, sigma=4.0):
    hw = int(4 * sigma)
    k  = np.exp(-0.5 * (np.arange(-hw, hw+1) / sigma)**2)
    k /= k.sum()
    return np.convolve(x, k, mode="same")


def _find_peaks(x, min_prominence, min_distance_samples):
    n   = len(x)
    raw = [i for i in range(1, n-1) if x[i] > x[i-1] and x[i] > x[i+1]]
    peaks = []
    for c in raw:
        if not peaks or (c - peaks[-1]) >= min_distance_samples:
            peaks.append(c)
        elif x[c] > x[peaks[-1]]:
            peaks[-1] = c
    if min_prominence > 0:
        peaks = [p for p in peaks
                 if x[p] - np.min(x[max(0,p-40):p+41]) >= min_prominence]
    return np.array(peaks, dtype=int)


def detect_video_jumps(hip_y, fps, jump_window, n_jumps=3):
    """
    hip_y: np array of hip Y pixel positions (NaN where not detected)
    jump_window: (t_start_s, t_end_s) — only look in this range
    """
    n      = len(hip_y)
    filled = hip_y.copy(); last = np.nan
    for i in range(len(filled)):
        if np.isnan(filled[i]): filled[i] = last
        else: last = filled[i]

    raw    = _gauss(filled, 6)
    signal = _gauss(-raw, 4)   # invert: jump up = upward move = Y decreases = positive peak

    t0_f = int(jump_window[0] * fps)
    t1_f = min(n, int(jump_window[1] * fps))
    sig_search = signal[t0_f:t1_f].copy()

    min_dist = int(VID_MIN_GAP_S * fps)
    peaks = _find_peaks(sig_search, VID_PROMINENCE, min_dist)

    if len(peaks) == 0:
        peaks = _find_peaks(sig_search, VID_PROMINENCE * 0.3, min_dist)

    if len(peaks) == 0:
        print("  [Video] WARNING: no jump peaks detected in jump window.")
        return []

    # offset back to full-signal indices
    peaks = peaks + t0_f

    ranked   = peaks[np.argsort(signal[peaks])[::-1]]
    selected = []
    for pk in ranked:
        if not selected or all(abs(pk - s) >= min_dist for s in selected):
            selected.append(pk)
        if len(selected) >= n_jumps:
            break
    selected = sorted(selected)

    peak_max = float(signal[selected].max()) if selected else 1.0
    jumps    = []
    ts_arr   = np.arange(n) / fps

    for pk in selected:
        t_pk = float(ts_arr[pk])
        half = 0.5 * signal[pk]
        lo, hi = pk, pk
        while lo > 0 and signal[lo] > half: lo -= 1
        while hi < len(signal)-1 and signal[hi] > half: hi += 1
        dur   = float(ts_arr[hi] - ts_arr[lo])
        h_cm  = (G / 8.0) * dur**2 * 100
        jumps.append(JumpEvent(
            source="video", time_s=t_pk, dur_s=dur,
            height_cm=h_cm, conf=float(signal[pk] / peak_max),
        ))
        print(f"  [Video] Jump @ t={t_pk:.2f}s  dur≈{dur:.2f}s  h≈{h_cm:.1f}cm")

    return jumps


def detect_imu_jumps(imu: IMUData, t0=10.0, t1=35.0, n_jumps=3):
    t, mg = imu.timestamps, imu.magnitude
    segs  = []
    in_ff = False; s = 0

    for i in range(len(mg)):
        if not (t0 <= t[i] <= t1):
            if in_ff: in_ff = False
            continue
        if mg[i] < IMU_FF_THR and not in_ff:
            in_ff = True; s = i
        elif mg[i] >= IMU_FF_THR and in_ff:
            in_ff = False
            dur = t[i-1] - t[s]
            if dur >= IMU_FF_MIN_DUR:
                peak_g = float(mg[s:i].min())
                segs.append({"start": s, "end": i-1, "dur": dur,
                              "t_mid": float(t[s] + dur/2), "peak_g": peak_g})

    # rank by lowest g (deepest free-fall = clearest jump)
    segs.sort(key=lambda x: x["peak_g"])

    selected = []
    for seg in segs:
        if not selected or all(abs(seg["t_mid"] - s["t_mid"]) >= VID_MIN_GAP_S
                                for s in selected):
            selected.append(seg)
        if len(selected) >= n_jumps:
            break

    jumps = []
    for seg in sorted(selected, key=lambda x: x["t_mid"]):
        h_cm = (G / 8.0) * seg["dur"]**2 * 100
        jumps.append(JumpEvent(
            source=imu.label, time_s=seg["t_mid"],
            dur_s=seg["dur"], height_cm=h_cm,
            conf=1.0 - seg["peak_g"] / IMU_FF_THR,
        ))
        print(f"  [{imu.label}] Jump @ t={seg['t_mid']:.2f}s  dur={seg['dur']:.2f}s  "
              f"peak_g={seg['peak_g']:.3f}")

    return jumps


def compute_sync(hip_y, fps, jump_window, n_jumps,
                 imu_r: Optional[IMUData] = None,
                 imu_l: Optional[IMUData] = None,
                 imu_t0=10.0, imu_t1=35.0):
    print("\n[Sync] Detecting video jumps…")
    vid_jumps = detect_video_jumps(hip_y, fps, jump_window, n_jumps)

    imu_r_jumps, imu_l_jumps = [], []
    if imu_r:
        print(f"[Sync] Detecting {imu_r.label} jumps…")
        imu_r_jumps = detect_imu_jumps(imu_r, imu_t0, imu_t1, n_jumps)
    if imu_l:
        print(f"[Sync] Detecting {imu_l.label} jumps…")
        imu_l_jumps = detect_imu_jumps(imu_l, imu_t0, imu_t1, n_jumps)

    n = min(len(vid_jumps),
            len(imu_r_jumps) if imu_r else 999,
            len(imu_l_jumps) if imu_l else 999,
            n_jumps)

    if n == 0:
        print("[Sync] WARNING: not enough matched jumps to compute offset.")
        return SyncResult(0.0, 0.0, vid_jumps, imu_r_jumps, imu_l_jumps)

    vt = np.array([j.time_s for j in vid_jumps[:n]])
    rt = np.array([j.time_s for j in imu_r_jumps[:n]]) if imu_r_jumps else np.zeros(n)
    lt = np.array([j.time_s for j in imu_l_jumps[:n]]) if imu_l_jumps else np.zeros(n)

    off_R = float(np.mean(rt - vt)) if imu_r else 0.0
    off_L = float(np.mean(lt - vt)) if imu_l else 0.0
    inter = float(np.mean(lt - rt)) if (imu_r and imu_l) else 0.0

    print(f"\n[Sync] Offsets:")
    if imu_r:
        print(f"  Video→IMU-R: {off_R:+.3f}s  (n={n} jumps)")
    if imu_l:
        print(f"  Video→IMU-L: {off_L:+.3f}s  (n={n} jumps)")
    if imu_r and imu_l:
        print(f"  Inter-sensor: {inter:+.3f}s  ({'L lags R' if inter > 0 else 'L leads R'} by {abs(inter):.3f}s)")

    return SyncResult(
        offset_R=off_R, offset_L=off_L,
        inter_sensor=inter,
        video_jumps=vid_jumps,
        imu_r_jumps=imu_r_jumps,
        imu_l_jumps=imu_l_jumps,
    )
