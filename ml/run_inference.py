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
import traceback

import imu_model
import video_model


def parse_args():
    parser = argparse.ArgumentParser(description="Run boxing session inference from S3")

    parser.add_argument("--session-id", required=True, help="Session identifier")
    parser.add_argument("--bucket", required=True, help="S3 bucket name")
    parser.add_argument("--region", required=True, help="AWS region")
    parser.add_argument("--csv-key", default="", help="S3 key for IMU CSV file")
    parser.add_argument("--mov-key", default="", help="S3 key for MOV/MP4 video file")

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
