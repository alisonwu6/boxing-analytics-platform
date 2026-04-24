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
