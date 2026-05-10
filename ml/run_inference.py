"""
Boxing session inference entry point.

Called by backend/services/ml-inference.service.js as a subprocess.

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
    parser.add_argument("--csv-key", required=True, help="S3 key for IMU CSV file")
    parser.add_argument(
        "--mov-key",
        default="",
        help="S3 key for MOV/MP4 video file",
    )

    return parser.parse_args()


def run(session_id: str, bucket: str, region: str, csv_key: str, mov_key: str) -> dict:
    result = imu_model.infer(
        bucket=bucket,
        region=region,
        csv_key=csv_key,
    )

    if mov_key:
        video_artifacts = video_model.infer(
            bucket=bucket,
            region=region,
            mov_key=mov_key,
            csv_key=csv_key,
            session_id=session_id,
        )

        result.setdefault("artifacts", {})
        result["artifacts"].update(video_artifacts)

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

    # Backend parses stdout as JSON, so all logs must go to stderr.
    print(json.dumps(result))


if __name__ == "__main__":
    main()