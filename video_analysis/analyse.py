"""
analyse.py — unified video analysis entry point

Usage:
  python analyse.py --video <path> [options]

Flags:
  --video <path>              required — input video file
  --out <stem>                output stem (default: same name as video, no extension)
  --model mediapipe|yolo      pose model (default: mediapipe)
  --model-path <path>         explicit path to pose_landmarker_heavy.task
  --duration <s>              only analyse first N seconds
  --imu-analysis              run IMU signal analysis (needs --imu-r or --imu-l)
  --imu-r <path>              right-wrist IMU CSV
  --imu-l <path>              left-wrist IMU CSV
  --sync                      compute video↔IMU sync offset (needs IMU file)
  --sync-auto                 auto-detect jump events to compute offset (needs --jump-window)
  --jump-window <t0> <t1>     time range in seconds to look for jump calibration
  --offset-r <s>              manual IMU-R offset in seconds (imu_t = video_t + offset)
  --offset-l <s>              manual IMU-L offset in seconds
  --no-render                 skip annotated video output
  --no-excel                  skip Excel export
  --no-csv                    skip tracking CSV export
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from core.landmarks import extract_landmarks
from core.signals import smooth_joints, interp_joints, compute_signals, hip_y_signal
from core.jab_detect import detect_jabs, apply_shoulder_zone_filter
from output.video_writer import render
from output.excel import export_excel
from output.csv_export import save_tracking_csv



def _progress(pct, msg):
    print(f"PROGRESS:{pct}:{msg}", flush=True)


def _load_imu(path, label):
    try:
        from core.imu import IMUProcessor
    except ImportError:
        sys.exit(
            "IMU analysis is not available because core/imu.py was not found. "
            "Disable --imu-analysis and --sync, or add core/imu.py to video_analysis/core."
        )

    proc = IMUProcessor()
    imu = proc.load(path, label=label)
    return imu


def _video_meta(path):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    W   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return fps, H, W, n


def parse_args():
    p = argparse.ArgumentParser(description="Boxing video analysis service")
    p.add_argument("--video",        required=True)
    p.add_argument("--out",          default=None)
    p.add_argument("--model",        default="mediapipe", choices=["mediapipe", "yolo"])
    p.add_argument("--model-path",   default=None)
    p.add_argument("--duration",     type=float, default=None)
    p.add_argument("--imu-analysis", action="store_true")
    p.add_argument("--imu-r",        default=None)
    p.add_argument("--imu-l",        default=None)
    p.add_argument("--sync",         action="store_true")
    p.add_argument("--sync-auto",    action="store_true")
    p.add_argument("--jump-window",  nargs=2, type=float, default=None, metavar=("T0","T1"))
    p.add_argument("--offset-r",     type=float, default=None)
    p.add_argument("--offset-l",     type=float, default=None)
    p.add_argument("--no-render",    action="store_true")
    p.add_argument("--no-excel",     action="store_true")
    p.add_argument("--no-csv",       action="store_true")
    return p.parse_args()


def validate(args):
    if args.imu_analysis and not (args.imu_r or args.imu_l):
        sys.exit("--imu-analysis requires at least one of --imu-r or --imu-l")

    if args.sync and not (args.imu_r or args.imu_l):
        sys.exit("--sync requires at least one of --imu-r or --imu-l")

    if args.sync_auto and not args.sync:
        sys.exit("--sync-auto requires --sync")

    if args.sync_auto and args.jump_window is None:
        sys.exit("--sync --sync-auto requires --jump-window <t0> <t1>")

    if args.sync and not args.sync_auto:
        if args.imu_r and args.offset_r is None:
            sys.exit("manual --sync with --imu-r requires --offset-r (or use --sync-auto)")
        if args.imu_l and args.offset_l is None:
            sys.exit("manual --sync with --imu-l requires --offset-l (or use --sync-auto)")


def main():
    args = parse_args()
    validate(args)

    video_path = args.video
    out_stem   = args.out or str(Path(video_path).with_suffix(""))

    fps, H, W, total_frames = _video_meta(video_path)
    n_frames = total_frames
    if args.duration is not None:
        n_frames = min(n_frames, int(args.duration * fps))

    _progress(2, f"Video {W}x{H} {fps:.0f}fps {total_frames} frames")
    print(f"\nVideo: {video_path}")
    print(f"  {W}x{H}  {fps:.2f}fps  {total_frames} frames ({total_frames/fps:.1f}s)")
    if args.duration:
        print(f"  Analysing first {n_frames} frames ({n_frames/fps:.1f}s)")

    # load IMU if needed
    if args.imu_r or args.imu_l:
        _progress(4, "Loading IMU data…")
    imu_r = _load_imu(args.imu_r, "IMU-R") if args.imu_r else None
    imu_l = _load_imu(args.imu_l, "IMU-L") if args.imu_l else None

    # pass 1 — extract raw landmarks
    _progress(5, "Extracting landmarks…")
    raw_jx, raw_jy, n_frames = extract_landmarks(
        video_path, fps, H, W,
        model=args.model,
        duration_s=args.duration,
        model_path=getattr(args, "model_path", None),
    )
    n_frames = min(n_frames, total_frames)

    # smooth + interpolate
    _progress(60, "Smoothing skeleton…")
    smooth_jx, smooth_jy = smooth_joints(raw_jx, raw_jy)
    interp_jx, interp_jy = interp_joints(raw_jx, raw_jy)

    # compute signals on interpolated coords
    _progress(62, "Computing signals…")
    L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea = compute_signals(
        interp_jx, interp_jy, n_frames, fps
    )

    # pass 1 jab detection (to build shoulder zone)
    _progress(64, "Pass 1 jab detection…")
    punches_p1, _ = detect_jabs(
        L_sp, L_dsw, L_dsw_dot, L_ea,
        R_sp, R_dsw, R_dsw_dot, R_ea,
        fps,
    )

    # shoulder zone filter + re-smooth
    _progress(67, "Shoulder zone filter…")
    raw_jx, raw_jy = apply_shoulder_zone_filter(raw_jx, raw_jy, punches_p1)
    smooth_jx, smooth_jy = smooth_joints(raw_jx, raw_jy)
    interp_jx, interp_jy = interp_joints(raw_jx, raw_jy)
    L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea = compute_signals(
        interp_jx, interp_jy, n_frames, fps
    )

    # pass 2 jab detection (final)
    _progress(70, "Pass 2 jab detection…")
    punches, rejected_peaks = detect_jabs(
        L_sp, L_dsw, L_dsw_dot, L_ea,
        R_sp, R_dsw, R_dsw_dot, R_ea,
        fps,
    )
    n_l = sum(1 for p in punches if p["hand"] == "L")
    n_r = sum(1 for p in punches if p["hand"] == "R")
    print(f"\nTotal jabs detected: L={n_l}  R={n_r}")

    # sync computation
    sync_result = None
    if args.sync:
        from core.sync import compute_sync, SyncResult
        _progress(73, "Computing sync offsets…")

        if args.sync_auto:
            _, hip_y, _ = hip_y_signal(raw_jx, raw_jy, n_frames, fps)
            sync_result = compute_sync(
                hip_y, fps,
                jump_window=tuple(args.jump_window),
                n_jumps=3,
                imu_r=imu_r,
                imu_l=imu_l,
            )
        else:
            off_r = args.offset_r or 0.0
            off_l = args.offset_l or 0.0
            from core.sync import SyncResult
            sync_result = SyncResult(
                offset_R=off_r,
                offset_L=off_l,
                video_jumps=[],
                imu_r_jumps=[],
                imu_l_jumps=[],
            )
            print(f"[Sync] Manual offsets — R:{off_r:+.3f}s  L:{off_l:+.3f}s")

        sync_path = out_stem + "_sync.json"
        with open(sync_path, "w") as f:
            json.dump({
                "offset_R_s": sync_result.offset_R,
                "offset_L_s": sync_result.offset_L,
                "inter_sensor_s": sync_result.inter_sensor,
                "video_jumps":  [vars(j) for j in sync_result.video_jumps],
                "imu_r_jumps":  [vars(j) for j in sync_result.imu_r_jumps],
                "imu_l_jumps":  [vars(j) for j in sync_result.imu_l_jumps],
            }, f, indent=2)
        print(f"Sync JSON → {sync_path}")

    # write punch JSON — always, so callers can read results
    _progress(75, "Writing punch data…")
    punch_json_path = out_stem + "_punches.json"
    def _pyval(v):
        if isinstance(v, np.integer): return int(v)
        if isinstance(v, np.floating): return float(v)
        return v
    punch_records = []
    for i, p in enumerate(sorted(punches, key=lambda x: x["peak_fi"]), 1):
        fwd_ms = round((p["peak_fi"] - p["start_fi"]) / fps * 1000, 1)
        ret_ms = round((p["end_fi"]  - p["peak_fi"])  / fps * 1000, 1)
        punch_records.append({
            "id":        i,
            "hand":      p["hand"],
            "type":      "jab",
            "peak_fi":   int(p["peak_fi"]),
            "start_fi":  int(p["start_fi"]),
            "end_fi":    int(p["end_fi"]),
            "time_s":    round(p["peak_fi"]  / fps, 3),
            "start_t_s": round(p["start_fi"] / fps, 3),
            "end_t_s":   round(p["end_fi"]   / fps, 3),
            "speed_px":  _pyval(p["peak_speed"]),
            "ea_load":   _pyval(p["ea_min"]),
            "ea_drive":  _pyval(p["ea_max_drive"]),
            "dsw_gain":  _pyval(p["dsw_gain"]),
            "fwd_ms":    fwd_ms,
            "ret_ms":    ret_ms,
        })
    with open(punch_json_path, "w") as f:
        json.dump({
            "video_path": video_path,
            "fps": fps,
            "n_frames": n_frames,
            "punches": punch_records,
        }, f, indent=2)
    print(f"Punch JSON → {punch_json_path}")

    # outputs
    if not args.no_csv:
        _progress(78, "Writing CSV…")
        save_tracking_csv(
            out_stem, fps, n_frames,
            smooth_jx, smooth_jy,
            L_dsw, R_dsw, L_sp, R_sp, L_ea, R_ea,
            punches,
        )

    if not args.no_excel:
        _progress(82, "Writing Excel…")
        export_excel(
            out_stem, fps, n_frames,
            L_sp, R_sp, L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_ea, R_ea,
            punches, rejected_peaks,
        )

    if not args.no_render:
        _progress(85, "Rendering annotated video…")
        out_video = render(
            video_path, out_stem, fps, H, W, n_frames,
            smooth_jx, smooth_jy,
            L_dsw, R_dsw, L_dsw_dot, R_dsw_dot,
            L_sp, R_sp, L_ea, R_ea,
            punches,
            imu_r=imu_r if args.imu_analysis else None,
            imu_l=imu_l if args.imu_analysis else None,
            sync_result=sync_result,
        )
        # update punch JSON with final video path
        with open(punch_json_path) as f:
            pdata = json.load(f)
        pdata["output_video"] = out_video
        with open(punch_json_path, "w") as f:
            json.dump(pdata, f, indent=2)
    else:
        print("--no-render: skipping video output.")

    _progress(100, f"Done — {len(punch_records)} jabs (L:{n_l} R:{n_r})")


if __name__ == "__main__":
    main()
