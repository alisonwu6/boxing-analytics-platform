"""Main pipeline: orchestrates video processing, IMU loading, sync, and output."""

import os
import time
from pathlib import Path
from typing import Optional, Tuple

from .core.video import VideoProcessor
from .core.imu import IMUProcessor
from .core.sync import Synchronizer, DataFusion, SyncResult
from .output.annotated_video import AnnotatedVideoWriter
from .output.visualizer import Visualizer
from .output.excel_export import export_excel


def run_pipeline(
    video_path:     str,
    imu_r_path:     Optional[str],
    imu_l_path:     Optional[str],
    out_dir:        str  = ".",
    n_jumps:        int  = 3,
    t_window:       Tuple[float, float] = (0.0, 30.0),
    override_off_R: Optional[float] = None,
    override_off_L: Optional[float] = None,
    write_video:    bool = True,
    pose_backend:   str  = "auto",
    imu_t0:         float = 10.0,
    imu_t1:         float = 35.0,
    vid_search_s:   float = 25.0,
    vid_stop_s:     Optional[float] = None,
) -> SyncResult:

    os.makedirs(out_dir, exist_ok=True)
    t0 = time.time()

    stem = Path(video_path).stem

    print("\n" + "═"*65)
    print("  BOXING ANALYTICS — VIDEO + IMU SYNC FRAMEWORK  v2")
    print("═"*65)

    # 1. Video
    vp  = VideoProcessor(video_path, pose_backend=pose_backend,
                         stop_at_s=vid_stop_s)
    kin = vp.process()
    backend_name = vp._backend.name if vp._backend else "opencv"

    # 2. IMU
    proc  = IMUProcessor()
    imu_r = proc.load(imu_r_path, "IMU-R") if imu_r_path else None
    imu_l = proc.load(imu_l_path, "IMU-L") if imu_l_path else None

    # 3. Synchronise
    syncer = Synchronizer(n_jumps, imu_t0=imu_t0, imu_t1=imu_t1,
                          vid_search_s=vid_search_s)
    sync   = syncer.synchronize(kin, imu_r, imu_l)

    # Override offsets if provided
    if override_off_R is not None:
        print(f"[Pipeline] Override → Video→IMU-R: {override_off_R:+.3f}s "
              f"(auto was {sync.offset_R:+.3f}s)")
        sync.offset_R = override_off_R
    if override_off_L is not None:
        print(f"[Pipeline] Override → Video→IMU-L: {override_off_L:+.3f}s "
              f"(auto was {sync.offset_L:+.3f}s)")
        sync.offset_L = override_off_L

    # 4. Fuse
    fusion = DataFusion(sync)
    fused  = fusion.fuse(kin, imu_r, imu_l, *t_window)

    # 5. Static plot
    plot_path = os.path.join(out_dir, f"{stem}_sync_comparison.png")
    Visualizer().plot(kin, imu_r, imu_l, sync, fused,
                      plot_path, t_win=t_window, backend_name=backend_name)

    # 6. Annotated video
    if write_video:
        vid_out = os.path.join(out_dir, f"{stem}_annotated.mp4")
        AnnotatedVideoWriter(
            video_path, vid_out, kin, imu_r, imu_l, sync, backend_name,
            t_end=t_window[1],
        ).write()

    # 7. Console report
    print("\n" + "─"*65)
    print("  FINAL OFFSET REPORT")
    print("─"*65)
    print(f"  Video→IMU-R (landmark)  : {sync.offset_R:+.3f} s")
    if imu_l:
        print(f"  Video→IMU-L (landmark)  : {sync.offset_L:+.3f} s")
        print(f"  Inter-sensor gap (L−R)  : {sync.inter_sensor:+.3f} s")
    print(f"  Cross-corr check (R)    : {sync.cc_offset_R:+.3f} s")
    if imu_l:
        print(f"  Cross-corr check (L)    : {sync.cc_offset_L:+.3f} s")
    print()
    headers = ["#", "Video (s)", "IMU-R (s)", "IMU-L (s)",
               "H_R (cm)", "H_L (cm)", "R-residual(ms)"]
    print("  " + "  ".join(f"{h:<14}" for h in headers))
    for i in range(min(len(sync.video_jumps),
                       max(len(sync.imu_r_jumps), 1))):
        vt = sync.video_jumps[i].time_s  if i < len(sync.video_jumps)  else "—"
        rt = sync.imu_r_jumps[i].time_s  if i < len(sync.imu_r_jumps)  else "—"
        lt = sync.imu_l_jumps[i].time_s  if i < len(sync.imu_l_jumps)  else "—"
        hr = f"{sync.imu_r_jumps[i].height_cm:.1f}" if i < len(sync.imu_r_jumps) else "—"
        hl = f"{sync.imu_l_jumps[i].height_cm:.1f}" if i < len(sync.imu_l_jumps) else "—"
        rr = f"{sync.residuals_R[i]*1000:+.1f}" if i < len(sync.residuals_R) else "—"
        row = [str(i+1), f"{vt:.3f}" if isinstance(vt, float) else vt,
               f"{rt:.3f}" if isinstance(rt, float) else rt,
               f"{lt:.3f}" if isinstance(lt, float) else lt, hr, hl, rr]
        print("  " + "  ".join(f"{v:<14}" for v in row))

    print(f"\n  Total runtime: {time.time()-t0:.1f}s")
    print("─"*65)

    # 8. Excel export
    xlsx_path = os.path.join(out_dir, f"{stem}_data.xlsx")
    export_excel(kin, imu_r, imu_l, sync, fused, xlsx_path)

    return sync
