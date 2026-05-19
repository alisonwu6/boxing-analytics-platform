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
    offset_R:     float          # imu_t = skew_R * video_t + offset_R
    offset_L:     float
    video_jumps:  List[JumpEvent]
    imu_r_jumps:  List[JumpEvent]
    imu_l_jumps:  List[JumpEvent]
    skew_R:       float = 1.0   # clock rate ratio; 1.0 = no skew
    skew_L:       float = 1.0
    cc_offset_R:  float = 0.0
    cc_offset_L:  float = 0.0
    inter_sensor: float = 0.0

    def video_to_imu_r(self, video_t: float) -> float:
        return self.skew_R * video_t + self.offset_R

    def video_to_imu_l(self, video_t: float) -> float:
        return self.skew_L * video_t + self.offset_L


G = 9.81
VID_MIN_GAP_S  = 2.5
VID_PROMINENCE = 0.3
IMU_FF_THR     = 0.55   # g - below this means the sensor is in free-fall (jumping)
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
    # hip_y: array of hip Y pixel positions (NaN where not detected)
    # jump_window: (t_start_s, t_end_s) - only search within this time range
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


CC_RESAMPLE_HZ   = 25.0    # common resampling rate for cross-correlation
CC_WINDOW_S      = 90.0    # late-window size for skew estimation
CC_MAX_LAG_S     = 30.0    # maximum lag search range
CC_MIN_CORR      = 0.05    # minimum acceptable correlation coefficient


def _cc_late_anchor(
    vid_signal,
    fps_vid: float,
    imu: IMUData,
    approx_offset_s: float,
    late_center_s: float,
) -> Optional[float]:
    # cross-correlates a late section of the video signal against the IMU to get a more
    # accurate offset at that point in time. returns None if the correlation is too weak.
    hz  = CC_RESAMPLE_HZ
    half = CC_WINDOW_S / 2.0
    t0_v = max(0.0, late_center_s - half)
    t1_v = min(len(vid_signal) / fps_vid, late_center_s + half)
    f0 = int(t0_v * fps_vid)
    f1 = int(t1_v * fps_vid)
    vid_seg = np.nan_to_num(vid_signal[f0:f1])
    if len(vid_seg) < int(hz * 10):
        return None

    # resample video segment to common grid
    vid_ts = np.arange(f0, f1) / fps_vid
    common_ts = np.arange(t0_v, t1_v, 1.0 / hz)
    vid_re = np.interp(common_ts, vid_ts, vid_seg)
    vid_re -= vid_re.mean()
    if vid_re.std() < 1e-9:
        return None
    vid_re /= vid_re.std()

    # pull IMU segment wider than the video window to cover the lag search
    imu_t0 = t0_v + approx_offset_s - CC_MAX_LAG_S
    imu_t1 = t1_v + approx_offset_s + CC_MAX_LAG_S
    mask = (imu.timestamps >= imu_t0) & (imu.timestamps <= imu_t1)
    imu_ts_win = imu.timestamps[mask]
    imu_mag_win = imu.magnitude[mask]
    if len(imu_ts_win) < int(hz * 5):
        return None

    # resample IMU onto a grid that spans the lag search range
    # shift by approx_offset so that lag=0 means "exact match at current estimate"
    imu_vid_ts = imu_ts_win - approx_offset_s
    lag_grid_ts = np.arange(t0_v - CC_MAX_LAG_S, t1_v + CC_MAX_LAG_S, 1.0 / hz)
    imu_re = np.interp(lag_grid_ts, imu_vid_ts, imu_mag_win, left=np.nan, right=np.nan)

    # sliding cross-correlation
    n_vid = len(vid_re)
    n_lag = int(CC_MAX_LAG_S * hz)
    lags = np.arange(-n_lag, n_lag + 1, dtype=int)
    center_idx = n_lag
    corrs = np.full(len(lags), np.nan)

    for k, lag in enumerate(lags):
        start = center_idx + lag
        imu_slice = imu_re[start: start + n_vid]
        if len(imu_slice) < n_vid:
            continue
        valid = ~np.isnan(imu_slice)
        if valid.sum() < n_vid * 0.5:
            continue
        imu_z = np.where(valid, imu_slice, 0.0)
        imu_z -= imu_z[valid].mean()
        std = imu_z[valid].std()
        if std < 1e-9:
            continue
        imu_z /= std
        corrs[k] = float(np.mean(vid_re * imu_z))

    if np.all(np.isnan(corrs)):
        return None

    best_k = int(np.nanargmax(corrs))
    best_corr = float(corrs[best_k])
    best_lag_s = lags[best_k] / hz
    refined_offset = approx_offset_s + best_lag_s

    print(f"  [Sync CC] late_center={late_center_s:.0f}s  corr={best_corr:.3f}  "
          f"Δlag={best_lag_s:+.3f}s  refined_offset={refined_offset:+.3f}s")

    if best_corr < CC_MIN_CORR:
        print(f"  [Sync CC] Weak correlation, skipping late anchor for skew")
        return None

    return refined_offset


def _compute_skew(early_vid_t, early_imu_t, late_vid_t, late_imu_t):
    # calculates clock drift (skew) and offset from two matched time points
    dt_vid = late_vid_t - early_vid_t
    dt_imu = late_imu_t - early_imu_t
    if abs(dt_vid) < 1.0:
        return 1.0, early_imu_t - early_vid_t
    skew  = dt_imu / dt_vid
    offset = early_imu_t - skew * early_vid_t
    return float(skew), float(offset)


def compute_sync(hip_y, fps, jump_window, n_jumps,
                 imu_r: Optional[IMUData] = None,
                 imu_l: Optional[IMUData] = None,
                 imu_t0=10.0, imu_t1=35.0,
                 wrist_sp_r=None,
                 wrist_sp_l=None):
    print("\n[Sync] Detecting video jumps...")
    vid_jumps = detect_video_jumps(hip_y, fps, jump_window, n_jumps)

    imu_r_jumps, imu_l_jumps = [], []
    if imu_r:
        print(f"[Sync] Detecting {imu_r.label} jumps...")
        imu_r_jumps = detect_imu_jumps(imu_r, imu_t0, imu_t1, n_jumps)
    if imu_l:
        print(f"[Sync] Detecting {imu_l.label} jumps...")
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
    skew_R = 1.0; skew_L = 1.0

    # early anchor: mean jump pair
    early_vid_t = float(np.mean(vt))
    early_imu_r_t = float(np.mean(rt)) if imu_r else 0.0
    early_imu_l_t = float(np.mean(lt)) if imu_l else 0.0

    # late anchor: cross-correlate wrist speed vs IMU in a window at ~75% of video
    vid_dur_s = len(hip_y) / fps
    late_center = min(vid_dur_s * 0.75, vid_dur_s - 40.0)
    late_center = max(late_center, early_vid_t + 60.0)

    if late_center > early_vid_t + 30.0:
        # prefer wrist speed (same signal as IMU measures); fall back to hip acceleration
        if imu_r:
            vid_sig_r = wrist_sp_r if wrist_sp_r is not None \
                        else np.abs(np.gradient(np.nan_to_num(hip_y)) * fps)
            print(f"\n[Sync] Late-window CC for IMU-R (center={late_center:.0f}s)...")
            late_off_r = _cc_late_anchor(vid_sig_r, fps, imu_r, off_R, late_center)
            if late_off_r is not None:
                late_imu_r_t = late_center + late_off_r
                skew_R, off_R = _compute_skew(early_vid_t, early_imu_r_t,
                                               late_center, late_imu_r_t)
                print(f"  [Sync] IMU-R  skew={skew_R:.6f}  offset={off_R:+.3f}s")

        if imu_l:
            vid_sig_l = wrist_sp_l if wrist_sp_l is not None \
                        else np.abs(np.gradient(np.nan_to_num(hip_y)) * fps)
            print(f"\n[Sync] Late-window CC for IMU-L (center={late_center:.0f}s)...")
            late_off_l = _cc_late_anchor(vid_sig_l, fps, imu_l, off_L, late_center)
            if late_off_l is not None:
                late_imu_l_t = late_center + late_off_l
                skew_L, off_L = _compute_skew(early_vid_t, early_imu_l_t,
                                               late_center, late_imu_l_t)
                print(f"  [Sync] IMU-L  skew={skew_L:.6f}  offset={off_L:+.3f}s")

    print(f"\n[Sync] Final parameters:")
    if imu_r:
        print(f"  IMU-R: skew={skew_R:.6f}  offset={off_R:+.3f}s  (n_jumps={n})")
    if imu_l:
        print(f"  IMU-L: skew={skew_L:.6f}  offset={off_L:+.3f}s  (n_jumps={n})")
    if imu_r and imu_l:
        print(f"  Inter-sensor: {inter:+.3f}s  ({'L lags R' if inter > 0 else 'L leads R'} by {abs(inter):.3f}s)")

    return SyncResult(
        offset_R=off_R, offset_L=off_L,
        skew_R=skew_R, skew_L=skew_L,
        inter_sensor=inter,
        video_jumps=vid_jumps,
        imu_r_jumps=imu_r_jumps,
        imu_l_jumps=imu_l_jumps,
    )
