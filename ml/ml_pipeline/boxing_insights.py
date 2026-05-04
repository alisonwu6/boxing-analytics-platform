import math

import numpy as np
import pandas as pd


TIME_COL = "TimeStamp (s)"
ACC_COLS = ["AccX (g)", "AccY (g)", "AccZ (g)"]
GYRO_COLS = ["GyroX (deg/s)", "GyroY (deg/s)", "GyroZ (deg/s)"]


def _finite_float(value):
    """Convert numpy/pandas scalar values into JSON-safe floats."""
    if value is None:
        return None

    try:
        output = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(output):
        return None

    return output


def _round_or_none(value, digits=4):
    output = _finite_float(value)
    return round(output, digits) if output is not None else None


def generate_basic_insights(predictions_df):
    """Generate simple session-level insights for frontend cards."""
    if predictions_df is None or predictions_df.empty:
        return {
            "total_punches": 0,
            "punch_type_counts": {},
            "session_start_time": None,
            "session_end_time": None,
            "session_duration_seconds": 0,
            "punches_per_minute": 0,
        }

    total_punches = int(len(predictions_df))
    punch_type_counts = predictions_df["type"].value_counts().to_dict()
    session_start = float(predictions_df["time"].min())
    session_end = float(predictions_df["time"].max())
    session_duration = max(session_end - session_start, 0)
    punches_per_minute = (total_punches / session_duration) * 60 if session_duration > 0 else 0

    return {
        "total_punches": total_punches,
        "punch_type_counts": punch_type_counts,
        "session_start_time": session_start,
        "session_end_time": session_end,
        "session_duration_seconds": float(session_duration),
        "punches_per_minute": float(punches_per_minute),
    }


def generate_advanced_insights(raw_df, predictions_df, window=80, baseline_threshold=1.0):
    """
    Generate event-level biomechanical punch insights for the app.

    The frontend should consume this JSON-ready structure instead of reading the
    notebook-only boxing_insights_full.csv export.
    """
    if raw_df is None or predictions_df is None or predictions_df.empty:
        return {
            "eventInsights": [],
            "summary": {},
            "definitions": _advanced_insight_definitions(),
        }

    df = raw_df.copy()
    df.columns = df.columns.str.strip()

    missing = [col for col in ACC_COLS + GYRO_COLS if col not in df.columns]
    if missing:
        return {
            "eventInsights": [],
            "summary": {},
            "definitions": _advanced_insight_definitions(),
            "warning": f"Missing required IMU columns: {missing}",
        }

    if TIME_COL in df.columns:
        df["Time"] = pd.to_numeric(df[TIME_COL], errors="coerce")
    elif "Time" in df.columns:
        df["Time"] = pd.to_numeric(df["Time"], errors="coerce")
    else:
        df["Time"] = np.arange(len(df)) * 0.005

    df["Time"] = df["Time"].interpolate().ffill().bfill()
    df[ACC_COLS + GYRO_COLS] = df[ACC_COLS + GYRO_COLS].apply(
        pd.to_numeric,
        errors="coerce",
    ).interpolate().ffill().bfill()

    df["acc_mag"] = np.sqrt(
        df["AccX (g)"] ** 2 +
        df["AccY (g)"] ** 2 +
        df["AccZ (g)"] ** 2
    )
    df["gyro_mag"] = np.sqrt(
        df["GyroX (deg/s)"] ** 2 +
        df["GyroY (deg/s)"] ** 2 +
        df["GyroZ (deg/s)"] ** 2
    )

    dt = df["Time"].diff().median()
    if pd.isna(dt) or dt <= 0:
        dt = 0.005

    df["jerk"] = (df["acc_mag"].diff() / dt).fillna(0)

    event_insights = []
    for _, row in predictions_df.iterrows():
        center_idx = int(row["center_idx"])
        lo = max(0, center_idx - window)
        hi = min(len(df) - 1, center_idx + window)
        seg = df.iloc[lo:hi + 1].copy()

        if seg.empty:
            continue

        peak_idx = int(seg["acc_mag"].idxmax())

        start_idx = peak_idx
        while start_idx > lo and df.loc[start_idx, "acc_mag"] > baseline_threshold:
            start_idx -= 1

        end_idx = peak_idx
        while end_idx < hi and df.loc[end_idx, "acc_mag"] > baseline_threshold:
            end_idx += 1

        if end_idx <= start_idx:
            continue

        start_time = _finite_float(df.loc[start_idx, "Time"])
        peak_time = _finite_float(df.loc[peak_idx, "Time"])
        end_time = _finite_float(df.loc[end_idx, "Time"])

        if start_time is None or peak_time is None or end_time is None:
            continue

        motion_seg = df.loc[start_idx:end_idx]
        retract_seg = df.loc[peak_idx:end_idx, "acc_mag"]
        extension_seg = df.loc[start_idx:peak_idx, "gyro_mag"]

        event_insights.append({
            "centerIdx": center_idx,
            "punchType": str(row["type"]),
            "confidence": _round_or_none(row.get("type_conf", 0.0)),
            "punchConfidence": _round_or_none(row.get("punch_conf", 0.0)),
            "startIdx": int(start_idx),
            "peakIdx": int(peak_idx),
            "endIdx": int(end_idx),
            "startTime": _round_or_none(start_time),
            "peakTime": _round_or_none(peak_time),
            "endTime": _round_or_none(end_time),
            "forwardTime": _round_or_none(peak_time - start_time),
            "retractionTime": _round_or_none(end_time - peak_time),
            "duration": _round_or_none(end_time - start_time),
            "peakAccel": _round_or_none(df.loc[peak_idx, "acc_mag"]),
            "peakSnap": _round_or_none(motion_seg["jerk"].abs().max()),
            "avgRetractionAccel": _round_or_none(retract_seg.mean()),
            "peakRotation": _round_or_none(extension_seg.max()),
        })

    return {
        "eventInsights": event_insights,
        "summary": _summarize_advanced_events(event_insights),
        "definitions": _advanced_insight_definitions(),
    }


def _summarize_advanced_events(event_insights):
    if not event_insights:
        return {}

    def values(key):
        return [event[key] for event in event_insights if event.get(key) is not None]

    peak_accels = values("peakAccel")
    forward_times = values("forwardTime")
    retraction_times = values("retractionTime")
    peak_snaps = values("peakSnap")
    avg_retraction_accels = values("avgRetractionAccel")
    peak_rotations = values("peakRotation")

    return {
        "avgForwardTime": _round_or_none(np.mean(forward_times)) if forward_times else None,
        "avgRetractionTime": _round_or_none(np.mean(retraction_times)) if retraction_times else None,
        "avgPeakAccel": _round_or_none(np.mean(peak_accels)) if peak_accels else None,
        "maxPeakAccel": _round_or_none(np.max(peak_accels)) if peak_accels else None,
        "avgPeakSnap": _round_or_none(np.mean(peak_snaps)) if peak_snaps else None,
        "avgRetractionAccel": (
            _round_or_none(np.mean(avg_retraction_accels))
            if avg_retraction_accels else None
        ),
        "avgPeakRotation": _round_or_none(np.mean(peak_rotations)) if peak_rotations else None,
    }


def _advanced_insight_definitions():
    return [
        {
            "name": "Start, Peak, and End Times",
            "description": "Start is first movement, peak is maximum impact, and end is return toward guard.",
        },
        {
            "name": "Forward Time",
            "description": "Time from punch start to peak impact. Lower values indicate faster extension.",
            "formula": "peakTime - startTime",
        },
        {
            "name": "Retraction Time",
            "description": "Time from peak impact back toward guard. Lower values indicate faster recovery.",
            "formula": "endTime - peakTime",
        },
        {
            "name": "Peak Acceleration",
            "description": "Maximum resultant acceleration inside the punch window.",
            "formula": "max(sqrt(AccX^2 + AccY^2 + AccZ^2))",
        },
        {
            "name": "Punch Snap",
            "description": "Maximum absolute jerk inside the punch boundary.",
            "formula": "(currentAccel - previousAccel) / deltaTime",
        },
        {
            "name": "Retraction Acceleration",
            "description": "Average resultant acceleration during pullback from peak to end.",
        },
        {
            "name": "Rotational Velocity",
            "description": "Peak gyroscope magnitude during extension, used as a fist-turnover indicator.",
            "formula": "max(sqrt(GyroX^2 + GyroY^2 + GyroZ^2))",
        },
    ]
