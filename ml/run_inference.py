"""
Boxing session inference entry point.

Called by backend/services/ml-inference.service.js as a subprocess.

Supported modes:
  CSV only:   --csv-key <s3-key>
  MOV only:   --mov-key <s3-key>
  Full:       --csv-key <s3-key> --mov-key <s3-key>
"""

import argparse
import json
import sys

import imu_model
import video_model


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run boxing session inference from S3"
    )

    parser.add_argument("--session-id", required=True, help="Session identifier")
    parser.add_argument("--bucket", required=True, help="S3 bucket name")
    parser.add_argument("--region", required=True, help="AWS region")
    parser.add_argument("--csv-key", default="", help="S3 key for IMU CSV file")
    parser.add_argument("--mov-key", default="", help="S3 key for MOV/MP4 video file")
    parser.add_argument("--video-model", default="mediapipe")
    parser.add_argument("--video-duration", default=None)
    parser.add_argument("--video-no-render", action="store_true")
    parser.add_argument("--video-no-excel", action="store_true")
    parser.add_argument("--video-no-csv", action="store_true")
    parser.add_argument("--video-enable-imu-overlay", action="store_true")
    parser.add_argument("--video-sync", action="store_true")
    parser.add_argument("--video-sync-auto", action="store_true")
    parser.add_argument("--video-offset-r", default=None)
    parser.add_argument("--video-offset-l", default=None)
    parser.add_argument("--video-jump-window", nargs=2, default=None)

    return parser.parse_args()


def empty_result() -> dict:
    return {
        "modelVersion": "1.2.0",
        "resultSummary": [],
        "metrics": [],
        "punchEvents": [],
        "advancedInsights": {
            "available": False,
            "reason": "No CSV analysis was run for this session.",
            "summary": {},
            "eventMetrics": [],
            "cadenceBlocks": [],
            "punchTypeAverages": [],
            "coachingInsights": [],
            "fieldDefinitions": {},
        },
        "artifacts": {},
    }


def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str, video_options: dict) -> dict:
    if not csv_key and not mov_key:
        raise ValueError("At least one of --csv-key or --mov-key is required")

    if csv_key:
        result = imu_model.infer(
            bucket=bucket,
            region=region,
            csv_key=csv_key,
        )
        result["modelVersion"] = result.get("modelVersion") or "1.2.0"
    else:
        result = empty_result()
        result["resultSummary"].append(
            "Video-only analysis completed. No CSV/IMU file was provided."
        )

    if mov_key:
        video_payload = video_model.infer(
            bucket=bucket,
            region=region,
            mov_key=mov_key,
            csv_key=csv_key or None,
            session_id=session_id,
            video_options=video_options,
        )

        result.setdefault("artifacts", {})
        result["artifacts"].update(video_payload.get("artifacts", video_payload))

        for line in video_payload.get("resultSummary", []):
            if line not in result["resultSummary"]:
                result["resultSummary"].append(line)

        if "videoPunchEvents" in video_payload:
            result["videoPunchEvents"] = video_payload["videoPunchEvents"]

    return result


def main():
    args = parse_args()

    try:
        result = run(
            session_id=args.session_id,
            bucket=args.bucket,
            region=args.region,
            csv_key=args.csv_key,
            mov_key=args.mov_key,
            video_options={
                "model": args.video_model,
                "duration": args.video_duration,
                "no_render": args.video_no_render,
                "no_excel": args.video_no_excel,
                "no_csv": args.video_no_csv,
                "enable_imu_overlay": args.video_enable_imu_overlay,
                "sync": args.video_sync,
                "sync_auto": args.video_sync_auto,
                "offset_r": args.video_offset_r,
                "offset_l": args.video_offset_l,
                "jump_window": args.video_jump_window,
            },
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    # Backend parses stdout as JSON, so all logs must go to stderr.
    print(json.dumps(result))


if __name__ == "__main__":
    main()