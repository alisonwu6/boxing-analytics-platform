"""
IMU / CSV inference module.

Reads sensor data (accelerometer + gyroscope) from S3 and returns punch events,
basic metrics, and advanced boxing insights derived from the IMU signal.
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
        dict matching the output contract in run_inference.py
    """
    s3 = boto3.client("s3", region_name=region)
    obj = s3.get_object(Bucket=bucket, Key=csv_key)
    raw_df = pd.read_csv(io.BytesIO(obj["Body"].read()))

    pipeline = _get_pipeline()
    predictions_df = pipeline.predict(raw_df)

    from ml_pipeline.boxing_insights import (
        generate_advanced_insights,
        generate_basic_insights,
    )

    insights = generate_basic_insights(predictions_df)

    try:
        advanced_insights = generate_advanced_insights(raw_df, predictions_df)
    except Exception as exc:
        print(f"[IMUModel] Advanced insight generation failed: {exc}", file=sys.stderr)
        advanced_insights = {
            "available": False,
            "reason": str(exc),
            "summary": {},
            "eventMetrics": [],
            "cadenceBlocks": [],
            "punchTypeAverages": [],
            "coachingInsights": [],
            "fieldDefinitions": {},
        }

    advanced_event_metrics = {}
    for event in advanced_insights.get("eventMetrics", []):
        event_id = event.get("eventId")
        if event_id is not None:
            advanced_event_metrics[int(event_id)] = event

    punch_events = []

    if not predictions_df.empty:
        for index, row in predictions_df.reset_index(drop=True).iterrows():
            event_id = index + 1
            event_metrics = advanced_event_metrics.get(event_id, {})

            punch_events.append(
                {
                    "eventId": event_id,
                    "t": float(row["time"]),
                    "hand": "unknown",
                    "type": str(row["type"]),
                    "confidence": float(row.get("type_conf", 0.0)),
                    "punchConfidence": float(row.get("punch_conf", 0.0)),

                    # Advanced event-level fields
                    "startTime": event_metrics.get("startTime"),
                    "peakTime": event_metrics.get("peakTime"),
                    "endTime": event_metrics.get("endTime"),
                    "forwardTime": event_metrics.get("forwardTime"),
                    "retractionTime": event_metrics.get("retractionTime"),
                    "peakAcceleration": event_metrics.get("peakAcceleration"),
                    "peakJerk": event_metrics.get("peakJerk"),
                    "avgRetractionAcceleration": event_metrics.get(
                        "avgRetractionAcceleration"
                    ),
                    "peakRotation": event_metrics.get("peakRotation"),
                }
            )

    metrics = [
        {"name": "totalPunches", "value": insights["total_punches"]},
        {
            "name": "punchesPerMinute",
            "value": round(insights["punches_per_minute"], 2),
        },
        {
            "name": "sessionDurationSecs",
            "value": round(insights["session_duration_seconds"], 2),
        },
    ]

    for punch_type, count in insights["punch_type_counts"].items():
        metrics.append({"name": f"count_{punch_type}", "value": count})

    advanced_summary = advanced_insights.get("summary", {})

    advanced_metric_map = {
        "avgForwardTime": "averageForwardTime",
        "avgRetractionTime": "averageRetractionTime",
        "fastestForwardTime": "fastestForwardTime",
        "fastestRetractionTime": "fastestRetractionTime",
        "avgPeakAcceleration": "averagePeakAcceleration",
        "maxPeakAcceleration": "maxPeakAcceleration",
        "avgPeakJerk": "averagePeakJerk",
        "maxPeakJerk": "maxPeakJerk",
        "avgRetractionAcceleration": "averageRetractionAcceleration",
        "avgPeakRotation": "averagePeakRotation",
        "maxPeakRotation": "maxPeakRotation",
    }

    for metric_name, summary_key in advanced_metric_map.items():
        value = advanced_summary.get(summary_key)
        if value is not None:
            metrics.append({"name": metric_name, "value": value})

    result_summary = []

    if insights["total_punches"] > 0:
        result_summary.append(
            f"{insights['total_punches']} punches detected "
            f"({round(insights['punches_per_minute'], 1)} per minute)"
        )

        for punch_type, count in insights["punch_type_counts"].items():
            result_summary.append(f"{punch_type}: {count}")

        if advanced_insights.get("available"):
            avg_forward = advanced_summary.get("averageForwardTime")
            avg_retraction = advanced_summary.get("averageRetractionTime")
            avg_peak_acc = advanced_summary.get("averagePeakAcceleration")
            avg_rotation = advanced_summary.get("averagePeakRotation")

            if avg_forward is not None:
                result_summary.append(f"Average forward time: {avg_forward}s")

            if avg_retraction is not None:
                result_summary.append(
                    f"Average retraction time: {avg_retraction}s"
                )

            if avg_peak_acc is not None:
                result_summary.append(
                    f"Average peak acceleration: {avg_peak_acc}g"
                )

            if avg_rotation is not None:
                result_summary.append(
                    f"Average peak rotation: {avg_rotation} deg/s"
                )

    return {
        "modelVersion": "1.1.0",
        "resultSummary": result_summary,
        "metrics": metrics,
        "punchEvents": punch_events,
        "advancedInsights": advanced_insights,
        "artifacts": {},
    }