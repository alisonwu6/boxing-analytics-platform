"""CLI entry point for Boxing Analytics."""

import argparse
import warnings

warnings.filterwarnings("ignore")

from .pipeline import run_pipeline


def main():
    ap = argparse.ArgumentParser(
        description="Boxing Analytics — Video + IMU Synchronisation Framework",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--video",        required=True,
                    help="Path to any MP4 video containing jump events")
    ap.add_argument("--imu_r",        default=None,
                    help="Path to right-wrist IMU file (.xlsx or .csv)")
    ap.add_argument("--imu_l",        default=None,
                    help="Path to left-wrist IMU file (.xlsx or .csv) — optional")
    ap.add_argument("--out_dir",      default=".",
                    help="Output directory for PNG + annotated MP4")
    ap.add_argument("--n_jumps",      type=int,   default=3,
                    help="Number of calibration jumps to detect")
    ap.add_argument("--t_start",      type=float, default=0.0,
                    help="Analysis window start (s)")
    ap.add_argument("--t_end",        type=float, default=30.0,
                    help="Analysis window end (s)")
    ap.add_argument("--offset_r",     type=float, default=None,
                    help="Override Video→IMU-R offset (s) — skips auto-detection")
    ap.add_argument("--offset_l",     type=float, default=None,
                    help="Override Video→IMU-L offset (s)")
    ap.add_argument("--no_video_out", action="store_true",
                    help="Skip annotated video output (faster for testing)")
    ap.add_argument("--pose_backend", default="auto",
                    choices=["auto", "mediapipe", "opencv"],
                    help="Pose estimation backend: 'mediapipe' (full skeleton), "
                         "'opencv' (bg-subtraction fallback), or 'auto' (tries mediapipe first)")

    grp = ap.add_argument_group("Jump detection windows (tune for different datasets)")
    grp.add_argument("--imu_t0",       type=float, default=10.0,
                     help="Start of IMU search window (s on raw IMU clock)")
    grp.add_argument("--imu_t1",       type=float, default=35.0,
                     help="End of IMU search window (s on raw IMU clock)")
    grp.add_argument("--vid_search",   type=float, default=25.0,
                     help="How many seconds of video to search for jumps (from t=0)")
    grp.add_argument("--vid_stop",     type=float, default=None,
                     help="Stop reading video frames after this many seconds "
                          "(speeds up long videos when jumps are near the start)")

    args = ap.parse_args()

    run_pipeline(
        video_path     = args.video,
        imu_r_path     = args.imu_r,
        imu_l_path     = args.imu_l,
        out_dir        = args.out_dir,
        n_jumps        = args.n_jumps,
        t_window       = (args.t_start, args.t_end),
        override_off_R = args.offset_r,
        override_off_L = args.offset_l,
        write_video    = not args.no_video_out,
        pose_backend   = args.pose_backend,
        imu_t0         = args.imu_t0,
        imu_t1         = args.imu_t1,
        vid_search_s   = args.vid_search,
        vid_stop_s     = args.vid_stop,
    )


if __name__ == "__main__":
    main()
