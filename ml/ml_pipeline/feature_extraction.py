import numpy as np

TIME_COL = "TimeStamp (s)"
FEATURE_COLS = [
    "AccX (g)", "AccY (g)", "AccZ (g)",
    "GyroX (deg/s)", "GyroY (deg/s)", "GyroZ (deg/s)"
]


def clean_imu_columns(df):
    """Remove leading/trailing spaces from raw IMU column names."""
    df = df.copy()
    df.columns = df.columns.str.strip()
    return df


def validate_raw_imu_columns(df):
    """Check that the raw IMU dataframe contains the required columns."""
    required = [TIME_COL] + FEATURE_COLS
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required IMU columns: {missing}")


def extract_features(segment):
    """
    Feature extraction used for unseen raw-data inference.

    The trained models are aligned by feature order during prediction, so extra
    features here are safe. Any unused feature is dropped by reindexing.
    """
    feats = {}

    for col in FEATURE_COLS:
        x = segment[col].values.astype(float)

        feats[col + "_mean"] = np.mean(x)
        feats[col + "_std"] = np.std(x)
        feats[col + "_max"] = np.max(x)
        feats[col + "_min"] = np.min(x)
        feats[col + "_range"] = np.max(x) - np.min(x)
        feats[col + "_energy"] = np.sum(x ** 2)

    return feats
