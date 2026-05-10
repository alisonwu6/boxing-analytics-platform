"""
Boxing session inference entry point.

Called by backend/services/ml-inference.service.js as a subprocess.

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
Supported modes:
  CSV only:   --csv-key <s3-key>
  MOV only:   --mov-key <s3-key>
  Full:       --csv-key <s3-key> --mov-key <s3-key>

Design rule:
  CSV / ML analysis and Video analysis are independent enough that a video
  failure should not hide a successful CSV result. In full mode, this script
  returns partial CSV results with a video error message if the video step fails.
=======
=======
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)
Example:
    python run_inference.py \
        --session-id <id> \
        --bucket <s3-bucket> \
        --region <aws-region> \
        --csv-key <s3-key> \
        [--mov-key <s3-key>]

Output contract:
{
    "modelVersion": "1.1.0",
    "resultSummary": [],
    "metrics": [],
    "punchEvents": [],
    "advancedInsights": {},
    "artifacts": {}
}
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)
"""

import argparse
import json
import sys
import traceback

import imu_model
import video_model


def parse_args():
    parser = argparse.ArgumentParser(description="Run boxing session inference from S3")

    parser.add_argument("--session-id", required=True, help="Session identifier")
    parser.add_argument("--bucket", required=True, help="S3 bucket name")
    parser.add_argument("--region", required=True, help="AWS region")
    parser.add_argument("--csv-key", required=True, help="S3 key for IMU CSV file")
    parser.add_argument(
        "--mov-key",
        default="",
        help="S3 key for MOV/MP4 video file",
    )
<<<<<<< HEAD
<<<<<<< HEAD

    # Video CLI pass-through options
    parser.add_argument("--model", choices=["mediapipe", "yolo"], default="mediapipe")
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--imu-analysis", action="store_true")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--sync-auto", action="store_true")
    parser.add_argument("--jump-window", nargs=2, type=float, metavar=("START", "END"), default=None)
    parser.add_argument("--offset-r", type=float, default=None)
    parser.add_argument("--offset-l", type=float, default=None)
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument("--no-excel", action="store_true")
    parser.add_argument("--no-csv", action="store_true")
=======
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)

    return parser.parse_args()


<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
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


def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
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
        )

        result.setdefault("artifacts", {})
        result["artifacts"].update(video_payload.get("artifacts", video_payload))

        for line in video_payload.get("resultSummary", []):
            if line not in result["resultSummary"]:
                result["resultSummary"].append(line)

            if "videoPunchEvents" in video_payload:
                result["videoPunchEvents"] = video_payload["videoPunchEvents"]
        except Exception as exc:
            video_error = str(exc)
            print(f"[RunInference] Video analysis failed: {video_error}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            result["videoAnalysisError"] = video_error
            append_unique(result.setdefault("resultSummary", []), f"Video analysis failed: {video_error}")

    # If everything relevant failed, fail the subprocess. If CSV succeeded but video failed,
    # return partial results so the ML tab can still display.
    if csv_key and csv_error and (not mov_key or video_error):
        raise RuntimeError(f"CSV/ML analysis failed: {csv_error}")

    if mov_key and video_error and not csv_key:
        raise RuntimeError(f"Video analysis failed: {video_error}")
=======
def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
    result = imu_model.infer(
        bucket=bucket,
        region=region,
        csv_key=csv_key,
    )

    if mov_key:
=======
def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
    result = imu_model.infer(
        bucket=bucket,
        region=region,
        csv_key=csv_key,
    )

    if mov_key:
>>>>>>> parent of a2d533c (update)
=======
def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
    result = imu_model.infer(
        bucket=bucket,
        region=region,
        csv_key=csv_key,
    )

    if mov_key:
>>>>>>> parent of a2d533c (update)
        video_artifacts = video_model.infer(
            bucket=bucket,
            region=region,
            mov_key=mov_key,
            csv_key=csv_key,
            session_id=session_id,
        )

        result.setdefault("artifacts", {})
        result["artifacts"].update(video_artifacts)
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)
=======
>>>>>>> parent of a2d533c (update)

    return result


def main():
    args = parse_args()

    try:
        validate_args(args)
        video_options = build_video_options(args)

        result = run(
            session_id=args.session_id,
            bucket=args.bucket,
            region=args.region,
            csv_key=args.csv_key,
            mov_key=args.mov_key,
            video_options=video_options,
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
