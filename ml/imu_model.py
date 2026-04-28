"""
IMU / CSV inference module.

Reads sensor data (accelerometer + gyroscope) from S3 and returns
punch events and metrics derived from the IMU signal.
"""

import io
import os
import sys

import boto3
import pandas as pd

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        from ml_pipeline.model_inference import PunchPredictionPipeline
        _pipeline = PunchPredictionPipeline(model_dir=_MODEL_DIR)
    return _pipeline


def infer(bucket: str, region: str, csv_key: str) -> dict:
    """
    Read the IMU CSV from S3 and run punch-recognition inference.

    Args:
        bucket:  S3 bucket name
        region:  AWS region
        csv_key: S3 object key for the IMU CSV file

    Returns:
        dict matching the OUTPUT CONTRACT in run_inference.py
    """
    s3 = boto3.client("s3", region_name=region)
    obj = s3.get_object(Bucket=bucket, Key=csv_key)
    raw_df = pd.read_csv(io.BytesIO(obj["Body"].read()))

    pipeline = _get_pipeline()
    predictions_df = pipeline.predict(raw_df)

    from ml_pipeline.boxing_insights import generate_basic_insights
    insights = generate_basic_insights(predictions_df)

    punch_events = []
    if not predictions_df.empty:
        for _, row in predictions_df.iterrows():
            punch_events.append({
                "t":          float(row["time"]),
                "hand":       "unknown",
                "type":       str(row["type"]),
                "confidence": float(row.get("type_conf", 0.0)),
            })

    metrics = [
        {"name": "totalPunches",       "value": insights["total_punches"]},
        {"name": "punchesPerMinute",   "value": round(insights["punches_per_minute"], 2)},
        {"name": "sessionDurationSecs","value": round(insights["session_duration_seconds"], 2)},
    ]
    for punch_type, count in insights["punch_type_counts"].items():
        metrics.append({"name": f"count_{punch_type}", "value": count})

    result_summary = []
    if insights["total_punches"] > 0:
        result_summary.append(
            f"{insights['total_punches']} punches detected "
            f"({round(insights['punches_per_minute'], 1)} per minute)"
        )
        for punch_type, count in insights["punch_type_counts"].items():
            result_summary.append(f"{punch_type}: {count}")

    return {
        "modelVersion":  "1.0.0",
        "resultSummary": result_summary,
        "metrics":       metrics,
        "punchEvents":   punch_events,
        "artifacts":     {},
    }
