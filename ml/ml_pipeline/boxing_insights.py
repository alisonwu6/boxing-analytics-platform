"""
Boxing insights utilities.

This file provides:
1. Basic session-level insights from predicted punch events.
2. Advanced event-level insights from raw IMU signals and predicted punch events.

The advanced insights are designed to be returned to the frontend as JSON:
{
    "advancedInsights": {
        "available": true,
        "summary": {},
        "eventMetrics": [],
        "cadenceBlocks": [],
        "punchTypeAverages": [],
        "coachingInsights": [],
        "fieldDefinitions": {}
    }
}
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------
# General helpers
# ---------------------------------------------------------------------


def _safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        number = float(value)

        if math.isfinite(number):
            return number

        return default
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        number = int(value)
        return number
    except Exception:
        return default


def _round(value: Any, digits: int = 3) -> Optional[float]:
    number = _safe_float(value)

    if number is None:
        return None

    return round(number, digits)


def _normalise_col_name(name: str) -> str:
    return (
        str(name)
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
        .replace("/", "")
    )


def _find_column(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    normalised_lookup = {
        _normalise_col_name(column): column for column in df.columns
    }

    for candidate in candidates:
        key = _normalise_col_name(candidate)

        if key in normalised_lookup:
            return normalised_lookup[key]

    return None


def _series_to_float_array(series: pd.Series) -> np.ndarray:
    return pd.to_numeric(series, errors="coerce").fillna(0.0).astype(float).to_numpy()


def _mean(values: List[float]) -> Optional[float]:
    clean_values = [
        float(value)
        for value in values
        if value is not None and math.isfinite(float(value))
    ]

    if not clean_values:
        return None

    return float(np.mean(clean_values))


def _max(values: List[float]) -> Optional[float]:
    clean_values = [
        float(value)
        for value in values
        if value is not None and math.isfinite(float(value))
    ]

    if not clean_values:
        return None

    return float(np.max(clean_values))


def _min(values: List[float]) -> Optional[float]:
    clean_values = [
        float(value)
        for value in values
        if value is not None and math.isfinite(float(value))
    ]

    if not clean_values:
        return None

    return float(np.min(clean_values))


# ---------------------------------------------------------------------
# Basic insights
# ---------------------------------------------------------------------


def generate_basic_insights(predictions_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate basic session-level insights from predicted punch events.

    Expected predictions_df columns:
    - time
    - type
    - type_conf optional
    - punch_conf optional

    Returns:
        {
            "total_punches": int,
            "punches_per_minute": float,
            "session_duration_seconds": float,
            "punch_type_counts": dict
        }
    """
    if predictions_df is None or predictions_df.empty:
        return {
            "total_punches": 0,
            "punches_per_minute": 0.0,
            "session_duration_seconds": 0.0,
            "punch_type_counts": {},
        }

    df = predictions_df.copy()

    if "time" not in df.columns:
        df["time"] = np.arange(len(df), dtype=float)

    df["time"] = pd.to_numeric(df["time"], errors="coerce").fillna(0.0)

    total_punches = int(len(df))

    start_time = float(df["time"].min())
    end_time = float(df["time"].max())

    session_duration_seconds = max(end_time - start_time, 0.0)

    if session_duration_seconds <= 0:
        punches_per_minute = 0.0
    else:
        punches_per_minute = (total_punches / session_duration_seconds) * 60.0

    if "type" in df.columns:
        punch_type_counts = (
            df["type"]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .to_dict()
        )
    else:
        punch_type_counts = {"Unknown": total_punches}

    return {
        "total_punches": total_punches,
        "punches_per_minute": float(punches_per_minute),
        "session_duration_seconds": float(session_duration_seconds),
        "punch_type_counts": punch_type_counts,
    }


# ---------------------------------------------------------------------
# Raw signal extraction
# ---------------------------------------------------------------------


def _build_signal_arrays(raw_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Build time, acceleration magnitude, gyro magnitude, and jerk arrays
    from the raw IMU dataframe.

    This function is deliberately flexible because CSV column names may
    differ slightly across devices/exports.
    """
    if raw_df is None or raw_df.empty:
        raise ValueError("Raw IMU dataframe is empty")

    df = raw_df.copy()

    time_col = _find_column(
        df,
        [
            "time",
            "timestamp",
            "timestamp(s)",
            "time(s)",
            "Time (s)",
            "Timestamp (s)",
            "seconds",
            "sec",
        ],
    )

    if time_col:
        time = _series_to_float_array(df[time_col])
    else:
        # Fallback: assume 200 Hz, dt = 0.005s
        time = np.arange(len(df), dtype=float) * 0.005

    acc_x_col = _find_column(
        df,
        [
            "AccX (g)",
            "AccX",
            "acc_x",
            "accx",
            "ax",
            "Accelerometer X",
            "Acceleration X",
        ],
    )

    acc_y_col = _find_column(
        df,
        [
            "AccY (g)",
            "AccY",
            "acc_y",
            "accy",
            "ay",
            "Accelerometer Y",
            "Acceleration Y",
        ],
    )

    acc_z_col = _find_column(
        df,
        [
            "AccZ (g)",
            "AccZ",
            "acc_z",
            "accz",
            "az",
            "Accelerometer Z",
            "Acceleration Z",
        ],
    )

    gyro_x_col = _find_column(
        df,
        [
            "GyroX (deg/s)",
            "GyroX",
            "gyro_x",
            "gyrox",
            "gx",
            "Gyroscope X",
            "Angular Velocity X",
        ],
    )

    gyro_y_col = _find_column(
        df,
        [
            "GyroY (deg/s)",
            "GyroY",
            "gyro_y",
            "gyroy",
            "gy",
            "Gyroscope Y",
            "Angular Velocity Y",
        ],
    )

    gyro_z_col = _find_column(
        df,
        [
            "GyroZ (deg/s)",
            "GyroZ",
            "gyro_z",
            "gyroz",
            "gz",
            "Gyroscope Z",
            "Angular Velocity Z",
        ],
    )

    missing_acc = [
        name
        for name, column in [
            ("AccX", acc_x_col),
            ("AccY", acc_y_col),
            ("AccZ", acc_z_col),
        ]
        if column is None
    ]

    if missing_acc:
        raise ValueError(
            "Missing acceleration columns required for advanced insights: "
            + ", ".join(missing_acc)
        )

    acc_x = _series_to_float_array(df[acc_x_col])
    acc_y = _series_to_float_array(df[acc_y_col])
    acc_z = _series_to_float_array(df[acc_z_col])

    acc_mag = np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)

    if gyro_x_col and gyro_y_col and gyro_z_col:
        gyro_x = _series_to_float_array(df[gyro_x_col])
        gyro_y = _series_to_float_array(df[gyro_y_col])
        gyro_z = _series_to_float_array(df[gyro_z_col])
        gyro_mag = np.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
    else:
        gyro_mag = np.zeros_like(acc_mag)

    time_diff = np.diff(time)
    valid_dt = time_diff[np.isfinite(time_diff) & (time_diff > 0)]

    dt = float(np.median(valid_dt)) if len(valid_dt) else 0.005

    jerk = np.zeros_like(acc_mag)

    if len(acc_mag) > 1:
        safe_dt = np.where(time_diff > 0, time_diff, dt)
        jerk[1:] = np.abs(np.diff(acc_mag) / safe_dt)

    return {
        "time": time,
        "acc_mag": acc_mag,
        "gyro_mag": gyro_mag,
        "jerk": jerk,
        "dt": dt,
        "columns": {
            "time": time_col,
            "accX": acc_x_col,
            "accY": acc_y_col,
            "accZ": acc_z_col,
            "gyroX": gyro_x_col,
            "gyroY": gyro_y_col,
            "gyroZ": gyro_z_col,
        },
    }


def _nearest_index(time_array: np.ndarray, target_time: float) -> int:
    if len(time_array) == 0:
        return 0

    return int(np.argmin(np.abs(time_array - target_time)))


# ---------------------------------------------------------------------
# Event-level advanced metrics
# ---------------------------------------------------------------------


def _extract_event_metrics(
    row: pd.Series,
    event_id: int,
    signals: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Estimate event-level advanced metrics around one predicted punch.

    Metrics:
    - startTime
    - peakTime
    - endTime
    - forwardTime
    - retractionTime
    - peakAcceleration
    - peakJerk
    - avgRetractionAcceleration
    - peakRotation
    """
    time = signals["time"]
    acc_mag = signals["acc_mag"]
    gyro_mag = signals["gyro_mag"]
    jerk = signals["jerk"]
    dt = float(signals["dt"] or 0.005)

    if len(time) == 0:
        return {}

    punch_time = _safe_float(row.get("time"), 0.0)

    if "center_idx" in row and not pd.isna(row.get("center_idx")):
        center_idx = _safe_int(row.get("center_idx"), 0)
    else:
        center_idx = _nearest_index(time, punch_time)

    center_idx = max(0, min(center_idx, len(time) - 1))

    # A punch normally fits within this local window.
    half_window_seconds = 0.8
    half_window_samples = max(int(half_window_seconds / max(dt, 1e-6)), 30)

    lo = max(0, center_idx - half_window_samples)
    hi = min(len(time) - 1, center_idx + half_window_samples)

    if hi <= lo:
        return {}

    local_acc = acc_mag[lo : hi + 1]

    if len(local_acc) == 0:
        return {}

    peak_idx = lo + int(np.argmax(local_acc))

    peak_acc = float(acc_mag[peak_idx])
    peak_time = float(time[peak_idx])

    pre_peak_segment = acc_mag[lo : max(lo + 1, peak_idx)]

    if len(pre_peak_segment):
        baseline = float(np.median(pre_peak_segment))
    else:
        baseline = 1.0

    # Dynamic threshold: more robust than a hard-coded 1g threshold.
    threshold = baseline + 0.2 * max(peak_acc - baseline, 0.0)

    start_idx = peak_idx

    while start_idx > lo and acc_mag[start_idx] > threshold:
        start_idx -= 1

    end_idx = peak_idx

    while end_idx < hi and acc_mag[end_idx] > threshold:
        end_idx += 1

    start_time = float(time[start_idx])
    end_time = float(time[end_idx])

    forward_time = max(peak_time - start_time, 0.0)
    retraction_time = max(end_time - peak_time, 0.0)

    extension_slice = slice(start_idx, peak_idx + 1)
    retraction_slice = slice(peak_idx, end_idx + 1)

    peak_jerk = (
        float(np.max(jerk[extension_slice]))
        if peak_idx >= start_idx and len(jerk[extension_slice]) > 0
        else 0.0
    )

    peak_rotation = (
        float(np.max(gyro_mag[extension_slice]))
        if peak_idx >= start_idx and len(gyro_mag[extension_slice]) > 0
        else 0.0
    )

    avg_retraction_acc = (
        float(np.mean(acc_mag[retraction_slice]))
        if end_idx >= peak_idx and len(acc_mag[retraction_slice]) > 0
        else 0.0
    )

    punch_type = str(row.get("type", "Unknown"))

    return {
        "eventId": event_id,
        "time": _round(punch_time, 4),
        "type": punch_type,
        "confidence": _round(row.get("type_conf", row.get("confidence", 0.0)), 4),
        "startTime": _round(start_time, 4),
        "peakTime": _round(peak_time, 4),
        "endTime": _round(end_time, 4),
        "forwardTime": _round(forward_time, 4),
        "retractionTime": _round(retraction_time, 4),
        "peakAcceleration": _round(peak_acc, 4),
        "peakJerk": _round(peak_jerk, 4),
        "avgRetractionAcceleration": _round(avg_retraction_acc, 4),
        "peakRotation": _round(peak_rotation, 4),
    }


# ---------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------


def _build_summary(event_metrics: List[Dict[str, Any]]) -> Dict[str, Any]:
    forward_times = [
        event["forwardTime"]
        for event in event_metrics
        if event.get("forwardTime") is not None
    ]

    retraction_times = [
        event["retractionTime"]
        for event in event_metrics
        if event.get("retractionTime") is not None
    ]

    peak_accelerations = [
        event["peakAcceleration"]
        for event in event_metrics
        if event.get("peakAcceleration") is not None
    ]

    peak_jerks = [
        event["peakJerk"]
        for event in event_metrics
        if event.get("peakJerk") is not None
    ]

    retraction_accelerations = [
        event["avgRetractionAcceleration"]
        for event in event_metrics
        if event.get("avgRetractionAcceleration") is not None
    ]

    peak_rotations = [
        event["peakRotation"]
        for event in event_metrics
        if event.get("peakRotation") is not None
    ]

    return {
        "eventCount": len(event_metrics),
        "averageForwardTime": _round(_mean(forward_times), 4),
        "averageRetractionTime": _round(_mean(retraction_times), 4),
        "fastestForwardTime": _round(_min(forward_times), 4),
        "fastestRetractionTime": _round(_min(retraction_times), 4),
        "averagePeakAcceleration": _round(_mean(peak_accelerations), 4),
        "maxPeakAcceleration": _round(_max(peak_accelerations), 4),
        "averagePeakJerk": _round(_mean(peak_jerks), 4),
        "maxPeakJerk": _round(_max(peak_jerks), 4),
        "averageRetractionAcceleration": _round(_mean(retraction_accelerations), 4),
        "averagePeakRotation": _round(_mean(peak_rotations), 4),
        "maxPeakRotation": _round(_max(peak_rotations), 4),
    }


def _build_cadence_blocks(
    predictions_df: pd.DataFrame,
    block_seconds: int = 15,
) -> List[Dict[str, Any]]:
    if predictions_df is None or predictions_df.empty or "time" not in predictions_df.columns:
        return []

    times = (
        pd.to_numeric(predictions_df["time"], errors="coerce")
        .dropna()
        .astype(float)
        .tolist()
    )

    if not times:
        return []

    max_time = max(times)
    block_count = int(math.floor(max_time / block_seconds)) + 1

    blocks = []

    for block_index in range(block_count):
        start = block_index * block_seconds
        end = start + block_seconds

        count = sum(1 for time_value in times if start <= time_value < end)
        ppm = (count / block_seconds) * 60.0

        blocks.append(
            {
                "blockIndex": block_index,
                "startTime": round(start, 2),
                "endTime": round(end, 2),
                "punchCount": int(count),
                "punchesPerMinute": round(ppm, 2),
            }
        )

    return blocks


def _build_punch_type_averages(
    event_metrics: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not event_metrics:
        return []

    df = pd.DataFrame(event_metrics)

    if df.empty or "type" not in df.columns:
        return []

    numeric_fields = [
        "forwardTime",
        "retractionTime",
        "peakAcceleration",
        "peakJerk",
        "avgRetractionAcceleration",
        "peakRotation",
    ]

    rows = []

    for punch_type, group in df.groupby("type"):
        row = {
            "type": str(punch_type),
            "count": int(len(group)),
        }

        for field in numeric_fields:
            if field in group.columns:
                values = pd.to_numeric(group[field], errors="coerce").dropna()
                row[f"avg{field[0].upper()}{field[1:]}"] = (
                    round(float(values.mean()), 4) if len(values) else None
                )

        rows.append(row)

    rows.sort(key=lambda item: item["count"], reverse=True)

    return rows


def _build_coaching_insights(
    summary: Dict[str, Any],
    cadence_blocks: List[Dict[str, Any]],
    punch_type_averages: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    insights = []

    avg_forward = summary.get("averageForwardTime")
    avg_retraction = summary.get("averageRetractionTime")
    avg_peak_acc = summary.get("averagePeakAcceleration")
    avg_peak_rotation = summary.get("averagePeakRotation")

    if avg_forward is not None:
        if avg_forward <= 0.25:
            insights.append(
                {
                    "title": "Fast punch delivery",
                    "message": "Average forward time is low, which suggests quick punch extension.",
                    "severity": "positive",
                }
            )
        elif avg_forward >= 0.45:
            insights.append(
                {
                    "title": "Slow punch extension",
                    "message": "Average forward time is relatively high. Focus on direct extension and reducing wind-up before impact.",
                    "severity": "warning",
                }
            )

    if avg_retraction is not None:
        if avg_retraction <= 0.35:
            insights.append(
                {
                    "title": "Good recovery speed",
                    "message": "Average retraction time is controlled, which supports faster return to guard.",
                    "severity": "positive",
                }
            )
        elif avg_retraction >= 0.55:
            insights.append(
                {
                    "title": "Recovery could improve",
                    "message": "Average retraction time is high. Work on returning the hand directly to guard after impact.",
                    "severity": "warning",
                }
            )

    if avg_peak_acc is not None:
        if avg_peak_acc >= 3.0:
            insights.append(
                {
                    "title": "Strong acceleration output",
                    "message": "Average peak acceleration is high, suggesting strong punch intensity.",
                    "severity": "positive",
                }
            )
        elif avg_peak_acc < 1.8:
            insights.append(
                {
                    "title": "Low acceleration output",
                    "message": "Peak acceleration is relatively low. Focus on sharper extension and better kinetic chain transfer.",
                    "severity": "info",
                }
            )

    if avg_peak_rotation is not None and avg_peak_rotation > 0:
        if avg_peak_rotation >= 250:
            insights.append(
                {
                    "title": "High fist turnover",
                    "message": "Peak rotational velocity is high, suggesting strong fist/forearm turnover during punches.",
                    "severity": "positive",
                }
            )
        elif avg_peak_rotation < 100:
            insights.append(
                {
                    "title": "Limited fist turnover",
                    "message": "Rotational velocity is relatively low. Review wrist and forearm turnover on the annotated video.",
                    "severity": "info",
                }
            )

    if cadence_blocks:
        first_half = cadence_blocks[: max(1, len(cadence_blocks) // 2)]
        second_half = cadence_blocks[max(1, len(cadence_blocks) // 2):]

        first_avg = _mean([block["punchesPerMinute"] for block in first_half])
        second_avg = _mean([block["punchesPerMinute"] for block in second_half])

        if first_avg is not None and second_avg is not None and first_avg > 0:
            drop_pct = ((first_avg - second_avg) / first_avg) * 100

            if drop_pct >= 25:
                insights.append(
                    {
                        "title": "Possible fatigue pattern",
                        "message": f"Cadence dropped by about {round(drop_pct, 1)}% in the second half. Review pacing and conditioning.",
                        "severity": "warning",
                    }
                )
            elif drop_pct <= 5:
                insights.append(
                    {
                        "title": "Consistent cadence",
                        "message": "Punch cadence stayed relatively stable across the session.",
                        "severity": "positive",
                    }
                )

    if punch_type_averages:
        dominant_type = punch_type_averages[0]

        insights.append(
            {
                "title": "Dominant punch type",
                "message": f"{dominant_type['type']} was the most frequent punch type in this session.",
                "severity": "info",
            }
        )

    if not insights:
        insights.append(
            {
                "title": "Session completed",
                "message": "Advanced insights were generated. Review event-level metrics with the annotated video.",
                "severity": "info",
            }
        )

    return insights


def _field_definitions() -> Dict[str, str]:
    return {
        "startTime": "Estimated time when punch movement begins.",
        "peakTime": "Estimated time of maximum resultant acceleration in the punch window.",
        "endTime": "Estimated time when punch movement returns near baseline.",
        "forwardTime": "Time from punch start to peak impact/acceleration.",
        "retractionTime": "Time from peak impact/acceleration to movement end.",
        "peakAcceleration": "Maximum resultant acceleration within the punch window.",
        "peakJerk": "Maximum rate of change in acceleration during the extension phase.",
        "avgRetractionAcceleration": "Average resultant acceleration during the recovery phase.",
        "peakRotation": "Maximum resultant gyroscope magnitude during the extension phase.",
        "cadenceBlocks": "Punch count and work rate grouped into time blocks.",
    }


# ---------------------------------------------------------------------
# Public advanced insight function
# ---------------------------------------------------------------------


def generate_advanced_insights(
    raw_df: pd.DataFrame,
    predictions_df: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Generate advanced boxing insights from raw IMU data and predicted punches.

    Returns:
        {
            "available": bool,
            "summary": {},
            "eventMetrics": [],
            "cadenceBlocks": [],
            "punchTypeAverages": [],
            "coachingInsights": [],
            "fieldDefinitions": {}
        }
    """
    if predictions_df is None or predictions_df.empty:
        return {
            "available": False,
            "reason": "No punch events detected",
            "summary": {},
            "eventMetrics": [],
            "cadenceBlocks": [],
            "punchTypeAverages": [],
            "coachingInsights": [],
            "fieldDefinitions": _field_definitions(),
        }

    signals = _build_signal_arrays(raw_df)

    event_metrics = []

    reset_predictions = predictions_df.reset_index(drop=True)

    for index, row in reset_predictions.iterrows():
        event_id = index + 1
        metrics = _extract_event_metrics(row, event_id, signals)

        if metrics:
            event_metrics.append(metrics)

    summary = _build_summary(event_metrics)
    cadence_blocks = _build_cadence_blocks(reset_predictions, block_seconds=15)
    punch_type_averages = _build_punch_type_averages(event_metrics)
    coaching_insights = _build_coaching_insights(
        summary,
        cadence_blocks,
        punch_type_averages,
    )

    return {
        "available": True,
        "summary": summary,
        "eventMetrics": event_metrics,
        "cadenceBlocks": cadence_blocks,
        "punchTypeAverages": punch_type_averages,
        "coachingInsights": coaching_insights,
        "fieldDefinitions": _field_definitions(),
    }