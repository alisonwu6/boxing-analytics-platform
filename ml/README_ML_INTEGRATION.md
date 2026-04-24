# Kivo Motion ML Pipeline Integration

This folder contains the app-ready ML pipeline for punch recognition and punch type classification.

## Main entry point

```python
import pandas as pd
from ml_pipeline.model_inference import PunchPredictionPipeline
from ml_pipeline.boxing_insights import generate_basic_insights

raw_df = pd.read_csv("NEW_RAW_IMU_TERE.L.csv")
pipeline = PunchPredictionPipeline(model_dir="models")
predictions = pipeline.predict(raw_df)
insights = generate_basic_insights(predictions)
```

## Input columns

- `TimeStamp (s)`
- `AccX (g)`
- `AccY (g)`
- `AccZ (g)`
- `GyroX (deg/s)`
- `GyroY (deg/s)`
- `GyroZ (deg/s)`

## Output columns

- `center_idx`: raw row index near the centre of the detected punch window
- `time`: approximate punch time in seconds
- `type`: predicted punch type (`Jab`, `Hook`, or `Uppercut`)
- `type_conf`: confidence of the punch type classifier
- `punch_conf`: confidence that the window contains a punch

## Note

For unlabeled raw IMU data, outputs are model predictions, not confirmed ground-truth labels. Accuracy, F1-score, and confusion matrix require manually verified labels or video validation.
