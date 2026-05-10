"""Jump detection, synchronisation, and data fusion."""

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from .imu import IMUData
from .video import VideoKinematics
from .utils import gaussian_smooth, find_peaks_simple, cross_correlate_offset


@dataclass
class JumpEvent:
    source:    str
    time_s:    float
    dur_s:     float
    height_cm: float
    conf:      float


@dataclass
class SyncResult:
    offset_R:     float   # imu_R_real = imu_R_timestamp − offset_R
    offset_L:     float   # (i.e. IMU clock is ahead of video by this amount)
    inter_sensor: float   # imu_L_time − imu_R_time for same jump
    cc_offset_R:  float   # cross-correlation verification
    cc_offset_L:  float
    video_jumps:  List[JumpEvent]
    imu_r_jumps:  List[JumpEvent]
    imu_l_jumps:  List[JumpEvent]
    residuals_R:  np.ndarray
    residuals_L:  np.ndarray


class Synchronizer:

    VID_MIN_GAP_S  = 2.5    # minimum seconds between jumps
    VID_PROMINENCE = 0.3    # minimum peak prominence in jump_signal units
    IMU_FF_THR     = 0.55   # g — free-fall threshold
    IMU_FF_MIN_DUR = 0.10   # seconds
    IMU_STRONG_THR = 0.25   # g — only strong events
    G = 9.81

    def __init__(self, n_jumps: int = 3,
                 imu_t0: float = 10.0, imu_t1: float = 35.0,
                 vid_search_s: float = 25.0):
        self.n            = n_jumps
        self.IMU_T0       = imu_t0
        self.IMU_T1       = imu_t1
        self.VID_SEARCH_S = vid_search_s

    def synchronize(self, kin: VideoKinematics,
                    imu_r: Optional[IMUData],
                    imu_l: Optional[IMUData]) -> SyncResult:

        print("\n[Synchronizer] ── Video jumps ──")
        vid_j = self._detect_video_jumps(kin)

        imu_r_j, imu_l_j = [], []
        if imu_r:
            print(f"[Synchronizer] ── {imu_r.label} jumps ──")
            imu_r_j = self._detect_imu_jumps(imu_r)
        if imu_l:
            print(f"[Synchronizer] ── {imu_l.label} jumps ──")
            imu_l_j = self._detect_imu_jumps(imu_l)

        # Compute offsets
        n = min(len(vid_j), len(imu_r_j), len(imu_l_j), self.n) if imu_l else \
            min(len(vid_j), len(imu_r_j), self.n)

        if n == 0:
            print("[Synchronizer] WARNING: cannot compute offset — no matched jumps.")
            return SyncResult(0,0,0,0,0, vid_j, imu_r_j, imu_l_j,
                              np.array([0.]), np.array([0.]))

        vt  = np.array([j.time_s for j in vid_j[:n]])
        rt  = np.array([j.time_s for j in imu_r_j[:n]]) if imu_r_j else np.zeros(n)
        lt  = np.array([j.time_s for j in imu_l_j[:n]]) if imu_l_j else np.zeros(n)

        off_R = rt - vt
        off_L = lt - vt

        mean_R = float(np.mean(off_R))
        mean_L = float(np.mean(off_L)) if imu_l else 0.0
        inter  = float(np.mean(lt - rt)) if imu_l else 0.0

        vid_acc = kin.acc_y
        cc_R = cross_correlate_offset(
            kin.timestamps, vid_acc,
            imu_r.timestamps if imu_r else kin.timestamps,
            -imu_r.acc_y if imu_r else vid_acc,
            fs=kin.fps,
            search_s=(mean_R - 4.0, mean_R + 4.0),
        ) if imu_r else 0.0

        cc_L = cross_correlate_offset(
            kin.timestamps, vid_acc,
            imu_l.timestamps if imu_l else kin.timestamps,
            -imu_l.acc_y if imu_l else vid_acc,
            fs=kin.fps,
            search_s=(mean_L - 4.0, mean_L + 4.0),
        ) if imu_l else 0.0

        print(f"\n[Synchronizer] ══ OFFSETS ══")
        print(f"  Video→IMU-R : {mean_R:+.3f}s ± {off_R.std():.3f}s  "
              f"(cross-corr: {cc_R:+.3f}s)")
        if imu_l:
            print(f"  Video→IMU-L : {mean_L:+.3f}s ± {off_L.std():.3f}s  "
                  f"(cross-corr: {cc_L:+.3f}s)")
            print(f"  Inter-sensor: {inter:+.3f}s  "
                  f"({'L lags R' if inter > 0 else 'L leads R'} by {abs(inter):.3f}s)")

        return SyncResult(
            offset_R=mean_R, offset_L=mean_L, inter_sensor=inter,
            cc_offset_R=cc_R, cc_offset_L=cc_L,
            video_jumps=vid_j, imu_r_jumps=imu_r_j, imu_l_jumps=imu_l_j,
            residuals_R=off_R - mean_R,
            residuals_L=off_L - mean_L if imu_l else np.zeros(n),
        )

    def _detect_video_jumps(self, kin: VideoKinematics) -> List[JumpEvent]:
        # Use MediaPipe hip_y if available
        if kin.lm_hip_y is not None and not np.all(np.isnan(kin.lm_hip_y)):
            raw = gaussian_smooth(kin.lm_hip_y, 6)
            signal = gaussian_smooth(-raw, 4)   # invert: jump up = pos peak
            sig_label = "MediaPipe_hip_y"
        else:
            signal = kin.jump_signal
            sig_label = "optical_flow+bbox"

        fps = kin.fps
        min_dist = int(self.VID_MIN_GAP_S * fps)
        search_n = int(self.VID_SEARCH_S * fps)

        # Find peaks only within search window
        sig_search = signal[:search_n].copy()

        peaks = find_peaks_simple(
            sig_search,
            min_prominence       = self.VID_PROMINENCE,
            min_distance_samples = min_dist,
        )

        if len(peaks) == 0:
            # Relax prominence and try again
            peaks = find_peaks_simple(
                sig_search,
                min_prominence       = self.VID_PROMINENCE * 0.3,
                min_distance_samples = min_dist,
            )

        if len(peaks) == 0:
            print("  [Video] WARNING: No jump peaks detected in video signal.")
            return []

        # Rank by amplitude, pick top N
        ranked = peaks[np.argsort(signal[peaks])[::-1]]
        # Greedy: select top peaks with min-gap constraint
        selected: List[int] = []
        for pk in ranked:
            if not selected or all(abs(pk - s) >= min_dist for s in selected):
                selected.append(pk)
            if len(selected) >= self.n:
                break
        selected = sorted(selected)

        jumps = []
        peak_max = float(signal[selected].max()) if selected else 1.0
        for pk in selected:
            t_pk = float(kin.timestamps[pk])
            # Estimate duration from half-prominence width
            half = 0.5 * signal[pk]
            lo, hi = pk, pk
            while lo > 0 and signal[lo] > half: lo -= 1
            while hi < len(signal) - 1 and signal[hi] > half: hi += 1
            dur = float(kin.timestamps[hi] - kin.timestamps[lo])
            h_cm = (self.G / 8.0) * dur**2 * 100
            jumps.append(JumpEvent(
                source="video", time_s=t_pk, dur_s=dur,
                height_cm=h_cm, conf=float(signal[pk] / peak_max),
            ))
            print(f"  [Video] Jump @ t={t_pk:.2f}s  signal={signal[pk]:.3f}  "
                  f"dur≈{dur:.2f}s  [{sig_label}]")
        return jumps

    def _detect_imu_jumps(self, imu: IMUData) -> List[JumpEvent]:
        t, mg = imu.timestamps, imu.magnitude
        segs: List[dict] = []
        in_ff = False; s = 0
        for i in range(len(mg)):
            if not (self.IMU_T0 <= t[i] <= self.IMU_T1):
                if in_ff: in_ff = False
                continue
            if mg[i] < self.IMU_FF_THR and not in_ff:
                in_ff = True; s = i
            elif mg[i] >= self.IMU_FF_THR and in_ff:
                in_ff = False
                dur = t[i-1] - t[s]
                if dur >= self.IMU_FF_MIN_DUR:
                    segs.append(dict(ts=t[s], te=t[i-1], dur=dur,
                                     min_mag=float(mg[s:i].min()),
                                     mid_t=float((t[s]+t[i-1])/2)))
        strong = [sg for sg in segs if sg["min_mag"] < self.IMU_STRONG_THR]
        # Cluster within 1.5s
        clustered: List[dict] = []
        for sg in strong:
            if not clustered or sg["mid_t"] - clustered[-1]["mid_t"] > 1.5:
                clustered.append(sg)
            elif sg["min_mag"] < clustered[-1]["min_mag"]:
                clustered[-1] = sg
        top = sorted(clustered, key=lambda x: x["min_mag"])[:self.n]
        top = sorted(top, key=lambda x: x["mid_t"])
        jumps = []
        for sg in top:
            h = (self.G / 8.0) * sg["dur"]**2 * 100
            jumps.append(JumpEvent(
                source=imu.label, time_s=sg["mid_t"], dur_s=sg["dur"],
                height_cm=h, conf=float(1 - sg["min_mag"] / self.IMU_STRONG_THR),
            ))
            print(f"  [{imu.label}] Jump @ t={sg['mid_t']:.3f}s  "
                  f"ff={sg['ts']:.3f}–{sg['te']:.3f}s  "
                  f"min|acc|={sg['min_mag']:.4f}g  h≈{h:.0f}cm")
        return jumps


@dataclass
class FusedDataset:
    times:     np.ndarray    # video-clock seconds, 200 Hz
    acc_y_R:   np.ndarray    # right wrist AccY on common grid
    acc_y_L:   np.ndarray    # left wrist AccY
    acc_y_vid: np.ndarray    # video-derived vertical acc (upsampled)
    source_R:  np.ndarray    # 0=IMU, 1=video-interpolated
    source_L:  np.ndarray
    fs:        float = 200.0


class DataFusion:
    TARGET_FS     = 200.0
    DROPOUT_GAP_S = 0.2

    def __init__(self, sync: SyncResult):
        self.sync = sync

    def fuse(self, kin: VideoKinematics,
             imu_r: Optional[IMUData], imu_l: Optional[IMUData],
             t_start: float = 0.0, t_end: float = 30.0) -> FusedDataset:

        dt     = 1.0 / self.TARGET_FS
        t_grid = np.arange(t_start, t_end, dt)
        zero   = np.zeros_like(t_grid)

        def interp_imu(imu: Optional[IMUData], off: float):
            if imu is None: return zero.copy(), np.ones(len(t_grid), dtype=bool)
            t_vid = imu.timestamps - off
            acc   = np.interp(t_grid, t_vid, imu.acc_y, left=np.nan, right=np.nan)
            drop  = np.interp(t_grid, t_vid,
                              imu.dropout_mask.astype(float), left=1, right=1) > 0.5
            drop |= np.isnan(acc)
            acc   = np.where(np.isnan(acc), 0.0, acc)
            return acc, drop

        acc_R, drop_R = interp_imu(imu_r, self.sync.offset_R)
        acc_L, drop_L = interp_imu(imu_l, self.sync.offset_L)

        vid_acc = np.interp(t_grid, kin.timestamps, -kin.acc_y, left=0, right=0)

        src_R = np.zeros(len(t_grid), dtype=np.int8)
        src_L = np.zeros(len(t_grid), dtype=np.int8)

        def fill(acc, drop, src, vid):
            out = acc.copy()
            in_d = False; s = 0
            for i in range(len(drop)):
                if drop[i] and not in_d: in_d = True; s = i
                elif not drop[i] and in_d:
                    in_d = False
                    if (i - s) * dt > self.DROPOUT_GAP_S:
                        out[s:i] = vid[s:i]
                        src[s:i] = 1
            return out

        acc_R = fill(acc_R, drop_R, src_R, vid_acc)
        acc_L = fill(acc_L, drop_L, src_L, vid_acc)

        print(f"[DataFusion] {len(t_grid)} samples @ {self.TARGET_FS}Hz  "
              f"IMU-R fallback: {(src_R==1).sum()/self.TARGET_FS:.2f}s  "
              f"IMU-L fallback: {(src_L==1).sum()/self.TARGET_FS:.2f}s")

        return FusedDataset(times=t_grid, acc_y_R=acc_R, acc_y_L=acc_L,
                            acc_y_vid=vid_acc, source_R=src_R, source_L=src_L)
