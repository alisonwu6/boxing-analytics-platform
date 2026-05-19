# analyse.py - main script to run video analysis on a boxing session
#
# Usage:
#   python analyse.py --video <path> [options]
#
# Flags:
#   --video <path>              required - input video file
#   --out <stem>                output file name prefix (default: same as video name)
#   --model-path <path>         path to pose_landmarker_heavy.task if not in default location
#   --duration <s>              only analyse first N seconds
#   --imu-analysis              run IMU signal analysis (needs --imu-r or --imu-l)
#   --imu-r <path>              right-wrist IMU CSV
#   --imu-l <path>              left-wrist IMU CSV
#   --sync                      compute video-IMU sync offset (needs IMU file)
#   --sync-auto                 auto-detect jump events to compute offset (needs --jump-window)
#   --jump-window <t0> <t1>     time range in seconds to look for jump calibration
#   --offset-r <s>              manual IMU-R offset in seconds (imu_t = video_t + offset)
#   --offset-l <s>              manual IMU-L offset in seconds
#   --punch-type jab|uppercut   type of punch to detect (default: jab)
#   --no-render                 skip annotated video output
#   --no-excel                  skip Excel export
#   --no-csv                    skip tracking CSV export

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from core.landmarks import extract_landmarks
from core.signals import (smooth_joints, smooth_joints_adaptive,
                          interp_joints,
                          compute_signals, compute_uc_signals, hip_y_signal)
from core.jab_detect import detect_jabs, apply_shoulder_zone_filter
from core.uppercut_detect import detect_uppercuts
from output.video_writer import render
from output.excel import export_excel
from output.csv_export import save_tracking_csv


def _progress(pct, msg):
    print(f"PROGRESS:{pct}:{msg}", flush=True)


def _load_imu(path, label):
    try:
        from boxing_analytics.core.imu import IMUProcessor
    except ImportError:
        sys.exit("boxing_analytics package not found - make sure it's in the Python path")
    proc = IMUProcessor()
    imu  = proc.load(path, label=label)
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
    p = argparse.ArgumentParser(description="Boxing video analysis")
    p.add_argument("--video",        required=True)
    p.add_argument("--out",          default=None)
    p.add_argument("--model-path",   default=None)
    p.add_argument("--duration",     type=float, default=None)
    p.add_argument("--start",        type=float, default=None, metavar="S",
                   help="start time in seconds (default: 0)")
    p.add_argument("--end",          type=float, default=None, metavar="S",
                   help="end time in seconds (default: end of video)")
    p.add_argument("--imu-analysis", action="store_true")
    p.add_argument("--imu-r",        default=None)
    p.add_argument("--imu-l",        default=None)
    p.add_argument("--sync",         action="store_true")
    p.add_argument("--sync-auto",    action="store_true")
    p.add_argument("--jump-window",  nargs=2, type=float, default=None, metavar=("T0","T1"))
    p.add_argument("--offset-r",     type=float, default=None)
    p.add_argument("--offset-l",     type=float, default=None)
    p.add_argument("--punch-type",   default="jab", choices=["jab", "uppercut"],
                   help="type of punch to detect (default: jab)")
    p.add_argument("--no-render",    action="store_true")
    p.add_argument("--no-excel",     action="store_true")
    p.add_argument("--no-csv",       action="store_true")
    p.add_argument("--smooth",       default="gaussian",
                   choices=["gaussian", "adaptive"])
    return p.parse_args()


def validate(args):
    if args.duration is not None and (args.start is not None or args.end is not None):
        sys.exit("--duration cannot be combined with --start / --end")
    if args.start is not None and args.start < 0:
        sys.exit("--start must be >= 0")
    if args.end is not None and args.start is not None and args.end <= args.start:
        sys.exit("--end must be greater than --start")

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
    start_s = args.start or 0.0
    if args.duration is not None:
        end_s = start_s + args.duration
    else:
        end_s = args.end or (total_frames / fps)
    end_s      = min(end_s, total_frames / fps)
    duration_s = end_s - start_s
    n_frames   = int(duration_s * fps)
    start_frame = int(start_s * fps)

    _progress(2, f"Video {W}x{H} {fps:.0f}fps {total_frames} frames")
    print(f"\nVideo: {video_path}")
    print(f"  {W}x{H}  {fps:.2f}fps  {total_frames} frames ({total_frames/fps:.1f}s)")
    print(f"  Analysing {start_s:.1f}s to {end_s:.1f}s  ({duration_s:.1f}s  {n_frames} frames)")

    # load IMU if needed
    if args.imu_r or args.imu_l:
        _progress(4, "Loading IMU data...")
    imu_r = _load_imu(args.imu_r, "IMU-R") if args.imu_r else None
    imu_l = _load_imu(args.imu_l, "IMU-L") if args.imu_l else None

    # extract raw joint positions from video
    _progress(5, "Extracting landmarks...")
    raw_jx, raw_jy, n_frames = extract_landmarks(
        video_path, fps, H, W,
        duration_s=duration_s,
        start_s=start_s,
        model_path=getattr(args, "model_path", None),
    )
    n_frames = min(n_frames, total_frames)

    # smooth and interpolate joint positions
    _progress(60, "Smoothing skeleton...")
    smooth_jx, smooth_jy = smooth_joints(raw_jx, raw_jy)
    interp_jx, interp_jy = interp_joints(raw_jx, raw_jy)

    # compute movement signals from joint positions
    _progress(62, "Computing signals...")
    L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea, \
    L_dsw_3d, R_dsw_3d, L_dsw_dot_3d, R_dsw_dot_3d = compute_signals(
        interp_jx, interp_jy, n_frames, fps,
    )

    if args.punch_type == "jab":
        # first pass to find jabs and use them to narrow down the shoulder zone
        _progress(64, "Pass 1 jab detection...")
        punches_p1, _ = detect_jabs(
            L_sp, L_dsw, L_dsw_dot, L_ea,
            R_sp, R_dsw, R_dsw_dot, R_ea,
            fps,
        )

        # filter out frames where the boxer is not in the expected shoulder position
        _progress(67, "Shoulder zone filter...")
        raw_jx, raw_jy = apply_shoulder_zone_filter(raw_jx, raw_jy, punches_p1)
        smooth_jx, smooth_jy = smooth_joints(raw_jx, raw_jy)
        interp_jx, interp_jy = interp_joints(raw_jx, raw_jy)
        L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea, \
        L_dsw_3d, R_dsw_3d, L_dsw_dot_3d, R_dsw_dot_3d = compute_signals(
            interp_jx, interp_jy, n_frames, fps,
        )

        # second pass with cleaner data - uses 3D arm extension when available
        _progress(70, "Pass 2 jab detection...")
        punches, rejected_peaks = detect_jabs(
            L_sp, L_dsw, L_dsw_dot, L_ea,
            R_sp, R_dsw, R_dsw_dot, R_ea,
            fps,
            L_dsw_3d=L_dsw_3d, R_dsw_3d=R_dsw_3d,
            L_dsw_dot_3d=L_dsw_dot_3d, R_dsw_dot_3d=R_dsw_dot_3d,
        )
        punches.sort(key=lambda p: p["peak_fi"])
        n_l = sum(1 for p in punches if p["hand"] == "L")
        n_r = sum(1 for p in punches if p["hand"] == "R")
        print(f"\nTotal jabs detected: L={n_l}  R={n_r}")

    else:  # uppercut
        _progress(67, "Computing uppercut signals...")
        L_vy, R_vy, L_wa, R_wa = compute_uc_signals(interp_jx, interp_jy, fps)

        _progress(70, "Detecting uppercuts...")
        punches, rejected_peaks = detect_uppercuts(
            L_sp, L_vy, L_wa, L_ea,
            R_sp, R_vy, R_wa, R_ea,
            fps,
        )
        punches.sort(key=lambda p: p["peak_fi"])
        n_l = sum(1 for p in punches if p["hand"] == "L")
        n_r = sum(1 for p in punches if p["hand"] == "R")
        print(f"\nTotal uppercuts detected: L={n_l}  R={n_r}")

    # sync computation
    sync_result = None
    if args.sync:
        from core.sync import compute_sync, SyncResult
        _progress(73, "Computing sync offsets...")

        if args.sync_auto:
            _, hip_y, _ = hip_y_signal(raw_jx, raw_jy, n_frames, fps)
            sync_result = compute_sync(
                hip_y, fps,
                jump_window=tuple(args.jump_window),
                n_jumps=3,
                imu_r=imu_r,
                imu_l=imu_l,
                wrist_sp_r=R_sp,
                wrist_sp_l=L_sp,
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
            print(f"[Sync] Manual offsets - R:{off_r:+.3f}s  L:{off_l:+.3f}s")

        sync_path = out_stem + "_sync.json"
        with open(sync_path, "w") as f:
            json.dump({
                "offset_R_s":    sync_result.offset_R,
                "skew_R":        sync_result.skew_R,
                "offset_L_s":    sync_result.offset_L,
                "skew_L":        sync_result.skew_L,
                "inter_sensor_s": sync_result.inter_sensor,
                "video_jumps":   [vars(j) for j in sync_result.video_jumps],
                "imu_r_jumps":   [vars(j) for j in sync_result.imu_r_jumps],
                "imu_l_jumps":   [vars(j) for j in sync_result.imu_l_jumps],
            }, f, indent=2)
        print(f"Saved sync JSON: {sync_path}")

    # write punch JSON so callers can read results
    _progress(75, "Writing punch data...")
    punch_json_path = out_stem + "_punches.json"
    def _pyval(v):
        if isinstance(v, np.integer): return int(v)
        if isinstance(v, np.floating): return float(v)
        return v
    punch_records = []
    for i, p in enumerate(punches, 1):
        ptype = p.get("type", args.punch_type)
        rec = {
            "id":            i,
            "hand":          p["hand"],
            "type":          ptype,
            "peak_fi":       int(p["peak_fi"]),
            "start_fi":      int(p["start_fi"]),
            "end_fi":        int(p["end_fi"]),
            "time_s":        round(p["peak_fi"]  / fps, 3),
            "start_t_s":     round(p["start_fi"] / fps, 3),
            "end_t_s":       round(p["end_fi"]   / fps, 3),
            "video_time_s":  round(start_s + p["peak_fi"]  / fps, 3),
            "video_start_s": round(start_s + p["start_fi"] / fps, 3),
            "video_end_s":   round(start_s + p["end_fi"]   / fps, 3),
            "peak_speed":    _pyval(p["peak_speed"]),
        }
        if ptype == "uppercut":
            rec["load_fi"]     = int(p["load_fi"])
            rec["load_min_wa"] = _pyval(p["load_min_wa"])
            rec["peak_ea"]     = _pyval(p["peak_ea"])
            rec["peak_vy"]     = _pyval(p["peak_vy"])
        else:
            fwd_ms = round((p["peak_fi"] - p["start_fi"]) / fps * 1000, 1)
            ret_ms = round((p["end_fi"]  - p["peak_fi"])  / fps * 1000, 1)
            rec["ea_load"]  = _pyval(p["ea_min"])
            rec["ea_drive"] = _pyval(p["ea_max_drive"])
            rec["dsw_gain"] = _pyval(p["dsw_gain"])
            rec["fwd_ms"]   = fwd_ms
            rec["ret_ms"]   = ret_ms
        punch_records.append(rec)
    with open(punch_json_path, "w") as f:
        json.dump({
            "video_path": video_path,
            "fps": fps,
            "start_s": start_s,
            "end_s": end_s,
            "n_frames": n_frames,
            "punches": punch_records,
        }, f, indent=2)
    print(f"Saved punch JSON: {punch_json_path}")

    # write outputs
    if not args.no_csv:
        _progress(78, "Writing CSV...")
        save_tracking_csv(
            out_stem, fps, n_frames,
            smooth_jx, smooth_jy,
            L_dsw, R_dsw, L_sp, R_sp, L_ea, R_ea,
            punches,
        )

    if not args.no_excel:
        _progress(82, "Writing Excel...")
        export_excel(
            out_stem, fps, n_frames,
            L_sp, R_sp, L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_ea, R_ea,
            punches, rejected_peaks,
        )

    if args.smooth == "adaptive":
        render_jx, render_jy = smooth_joints_adaptive(
            smooth_jx, smooth_jy, interp_jx, interp_jy, punches, n_frames)
    else:
        render_jx, render_jy = smooth_jx, smooth_jy

    if not args.no_render:
        _progress(85, "Rendering annotated video...")
        out_video = render(
            video_path, out_stem, fps, H, W, n_frames,
            render_jx, render_jy,
            L_dsw, R_dsw, L_dsw_dot, R_dsw_dot,
            L_sp, R_sp, L_ea, R_ea,
            punches,
            imu_r=imu_r if args.imu_analysis else None,
            imu_l=imu_l if args.imu_analysis else None,
            sync_result=sync_result,
            L_dsw_3d=L_dsw_3d, R_dsw_3d=R_dsw_3d,
            L_dsw_dot_3d=L_dsw_dot_3d, R_dsw_dot_3d=R_dsw_dot_3d,
            start_frame=start_frame,
        )
        # update punch JSON with the final video path
        with open(punch_json_path) as f:
            pdata = json.load(f)
        pdata["output_video"] = out_video
        with open(punch_json_path, "w") as f:
            json.dump(pdata, f, indent=2)
    else:
        print("--no-render: skipping video output.")

    ptype_label = "uppercuts" if args.punch_type == "uppercut" else "jabs"
    _progress(100, f"Done - {len(punch_records)} {ptype_label}  (L:{n_l}  R:{n_r})")


if __name__ == "__main__":
    main()
