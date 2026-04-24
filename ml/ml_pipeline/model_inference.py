import joblib
import numpy as np
import pandas as pd

from ml_pipeline.feature_extraction import (
    TIME_COL,
    clean_imu_columns,
    validate_raw_imu_columns,
    extract_features,
)


class PunchPredictionPipeline:
    """
    App-ready inference wrapper for the QBC punch recognition and classification pipeline.

    Input: raw IMU pandas dataframe or CSV file.
    Output: dataframe of predicted punch events with time, type, and confidence.
    """

    def __init__(self, model_dir="models"):
        self.rec_bundle = joblib.load(f"{model_dir}/recognition_model_bundle.pkl")
        self.cls_bundle = joblib.load(f"{model_dir}/classification_model_bundle.pkl")

        self.rec_models = self.rec_bundle["fitted_models"]
        self.cls_models = self.cls_bundle["fitted_models"]

        self.rec_classes = np.asarray(self.rec_bundle["classes"])
        self.cls_classes = np.asarray(self.cls_bundle["classes"])

        self.rec_feature_order = self.rec_bundle["feature_order"]
        self.cls_feature_order = self.cls_bundle["feature_order"]

        self.window_size = int(self.rec_bundle.get("window_size", 161))
        self.step = int(self.rec_bundle.get("step", 20))
        self.merge_gap = float(self.rec_bundle.get("merge_gap", 0.8))
        self.punch_conf_threshold = float(self.rec_bundle.get("punch_conf_threshold", 0.70))

    @staticmethod
    def _average_proba(models, X, target_classes):
        """Average committee probabilities while aligning class order."""
        all_probs = []
        for model in models:
            probs = model.predict_proba(X)
            model_classes = np.asarray(model.classes_)
            if not np.array_equal(model_classes, target_classes):
                aligned = np.zeros((len(X), len(target_classes)))
                for i, cls in enumerate(model_classes):
                    target_idx = np.where(target_classes == cls)[0][0]
                    aligned[:, target_idx] = probs[:, i]
                probs = aligned
            all_probs.append(probs)
        return np.mean(all_probs, axis=0)

    def build_windows(self, raw_df):
        """Convert raw IMU rows into fixed-length sliding windows."""
        raw_df = clean_imu_columns(raw_df)
        validate_raw_imu_columns(raw_df)
        half = self.window_size // 2
        X_rows = []
        meta_rows = []
        for center_idx in range(half, len(raw_df) - half, self.step):
            seg = raw_df.iloc[center_idx - half:center_idx + half].copy()
            feats = extract_features(seg)
            X_rows.append(feats)
            meta_rows.append({
                "center_idx": int(center_idx),
                "time": float(raw_df.iloc[center_idx][TIME_COL]),
            })
        return pd.DataFrame(X_rows), pd.DataFrame(meta_rows)

    def predict(self, raw_df):
        """Run recognition, classification, and merging on raw IMU data."""
        X, meta = self.build_windows(raw_df)
        if X.empty:
            return pd.DataFrame(columns=["center_idx", "time", "type", "type_conf", "punch_conf"])

        X_rec = X.reindex(columns=self.rec_feature_order, fill_value=0)
        rec_probs = self._average_proba(self.rec_models, X_rec, self.rec_classes)
        rec_raw = self.rec_classes[np.argmax(rec_probs, axis=1)]
        punch_idx = np.where(self.rec_classes == "Punch")[0][0]
        punch_conf = rec_probs[:, punch_idx]

        rec_final = np.where(
            (rec_raw == "Punch") & (punch_conf >= self.punch_conf_threshold),
            "Punch",
            "No Punch"
        )

        meta["rec_raw"] = rec_raw
        meta["punch_conf"] = punch_conf
        meta["rec"] = rec_final
        punch_windows = meta[meta["rec"] == "Punch"].copy()
        if punch_windows.empty:
            return pd.DataFrame(columns=["center_idx", "time", "type", "type_conf", "punch_conf"])

        X_punch = X.loc[punch_windows.index].copy()
        X_cls = X_punch.reindex(columns=self.cls_feature_order, fill_value=0)
        cls_probs = self._average_proba(self.cls_models, X_cls, self.cls_classes)
        cls_pred = self.cls_classes[np.argmax(cls_probs, axis=1)]
        cls_conf = np.max(cls_probs, axis=1)

        punch_windows["type"] = cls_pred
        punch_windows["type_conf"] = cls_conf

        final_rows = []
        last_time = -999.0
        for _, row in punch_windows.iterrows():
            if row["time"] - last_time > self.merge_gap:
                final_rows.append(row)
                last_time = row["time"]

        final_df = pd.DataFrame(final_rows)
        if final_df.empty:
            return pd.DataFrame(columns=["center_idx", "time", "type", "type_conf", "punch_conf"])

        return final_df[["center_idx", "time", "type", "type_conf", "punch_conf"]].reset_index(drop=True)

    def predict_from_csv(self, csv_path):
        raw_df = pd.read_csv(csv_path)
        return self.predict(raw_df)
