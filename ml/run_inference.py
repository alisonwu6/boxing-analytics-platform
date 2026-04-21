"""
Boxing session inference — entry point.

Called by the backend (ml-inference.service.js) as a subprocess:
    python3 run_inference.py \
        --session-id <id> \
        --bucket     <s3-bucket> \
        --region     <aws-region> \
        --csv-key    <s3-key> \
        [--mov-key   <s3-key>]

Exit codes:
    0  success — stdout is a single JSON object (see OUTPUT CONTRACT below)
    1  failure — stderr message is captured as errorMessage in the DB

OUTPUT CONTRACT:
{
    "modelVersion": "1.0.0",
    "resultSummary": [],
    "metrics":       [],   # e.g. { "name": "totalPunches", "value": 42 }
    "punchEvents":   [],   # e.g. { "t": 1.23, "hand": "right", "type": "jab" }
    "artifacts":     {}
}
"""

import argparse
import json
import sys

import imu_model
import video_model


def parse_args():
    parser = argparse.ArgumentParser(description="Run boxing session inference from S3")
    parser.add_argument("--session-id", required=True, help="Session identifier")
    parser.add_argument("--bucket",     required=True, help="S3 bucket name")
    parser.add_argument("--region",     required=True, help="AWS region")
    parser.add_argument("--csv-key",    required=True, help="S3 key for the IMU CSV file")
    parser.add_argument("--mov-key",    default="",    help="S3 key for the MOV video file (optional)")
    return parser.parse_args()


def merge(base: dict, extra: dict) -> dict:
    """Merge video results into the IMU base result."""
    return {
        **base,
        "resultSummary": base.get("resultSummary", []) + extra.get("resultSummary", []),
        "metrics":       base.get("metrics", [])       + extra.get("metrics", []),
        "punchEvents":   base.get("punchEvents", [])   + extra.get("punchEvents", []),
        "artifacts":     {**base.get("artifacts", {}), **extra.get("artifacts", {})},
    }


def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
    result = imu_model.infer(bucket=bucket, region=region, csv_key=csv_key)

    if mov_key:
        video_result = video_model.infer(bucket=bucket, region=region, mov_key=mov_key)
        result = merge(result, video_result)

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
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
