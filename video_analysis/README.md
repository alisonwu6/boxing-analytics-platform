# Video Analysis Service

Standalone CLI for boxing video analysis. Takes a video (+ optional IMU files) and outputs an annotated video, punch data, Excel report, and tracking CSV.

---

## Setup

### 1. Prerequisites

- Python 3.10 or newer
- `pose_landmarker_heavy.task` — MediaPipe heavy pose model file, placed in the `video_analysis/` directory (download from the MediaPipe Model Zoo)

### 2. Create a virtual environment

```bash
cd video_analysis
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install \
  mediapipe==0.10.33 \
  opencv-python==4.13.0.92 \
  numpy==2.2.6 \
  openpyxl==3.1.5 \
  pandas==2.3.3
```

If you want to use `--model yolo` (YOLOv8 pose):

```bash
pip install ultralytics==8.4.46
```

### 4. Verify setup

```bash
python analyse.py --video your_video.mp4 --no-render --no-excel --no-csv
```

You should see landmark extraction start and a jab count printed at the end.

---

## Usage

Always run from the `video_analysis/` directory so module imports resolve correctly:

```bash
python analyse.py --video <path> [options]
```

---

## Flags

### Input / Output

| Flag | Default | Description |
|------|---------|-------------|
| `--video <path>` | — | **Required.** Path to the input video file (.mov, .mp4, .avi) |
| `--out <stem>` | Same as video, no extension | Output file stem. All output files are named `<stem>.mp4`, `<stem>.xlsx`, etc. Useful when you want outputs in a specific folder |
| `--duration <s>` | Full video | Only analyse the first N seconds. Useful for quick tests without waiting for a full run |

### Pose Model

| Flag | Default | Description |
|------|---------|-------------|
| `--model mediapipe\|yolo` | `mediapipe` | Pose estimation backend. MediaPipe is faster on CPU (~5-10x). YOLO (YOLOv8x-pose) is more accurate in multi-person scenes and handles partial occlusion better but is significantly slower without a GPU |
| `--model-path <path>` | Auto-detected | Explicit path to `pose_landmarker_heavy.task`. By default the script searches in the `video_analysis/` directory |

### IMU Data

| Flag | Default | Description |
|------|---------|-------------|
| `--imu-r <path>` | — | Path to the right-wrist IMU CSV file |
| `--imu-l <path>` | — | Path to the left-wrist IMU CSV file |
| `--imu-analysis` | Off | When set, renders IMU acceleration bars on the annotated video alongside the skeleton. Requires at least one of `--imu-r` or `--imu-l` |

The IMU CSV is expected to have columns: `TimeStamp(s)`, `AccX(g)`, `AccY(g)`, `AccZ(g)`, `GyroX`, `GyroY`, `GyroZ`. Linear acceleration columns (`LinAccX`, `LinAccY`, `LinAccZ`) are optional but used if present.

### Synchronisation

IMU sensors and the camera have independent clocks. These flags let you align them.

| Flag | Default | Description |
|------|---------|-------------|
| `--sync` | Off | Enable sync offset computation. Without this, IMU data is used as-is with no time alignment |
| `--sync-auto` | Off | Auto-detect sync offset by matching jump events between video and IMU. Requires `--sync` and `--jump-window`. The boxer performs 2-3 clearly separated jumps at the start of the session which appear as hip-Y dips in video and near-zero-g windows in the IMU |
| `--jump-window <t0> <t1>` | — | Time range in seconds to search for jump events (e.g. `5 25`). Required when using `--sync-auto`. Keeps the detector from confusing punch movements with jumps |
| `--offset-r <s>` | — | Manual IMU-R offset in seconds. Meaning: `imu_timestamp - offset = video_timestamp`. Required when using `--sync` without `--sync-auto` and `--imu-r` is provided |
| `--offset-l <s>` | — | Manual IMU-L offset in seconds. Same meaning as above for the left sensor |

### Output Control

| Flag | Description |
|------|-------------|
| `--no-render` | Skip the annotated video output. Useful for quick jab count checks — landmark extraction still runs but the slow frame-by-frame render is skipped |
| `--no-excel` | Skip the Excel export |
| `--no-csv` | Skip the per-frame tracking CSV |

---

## Examples

```bash
# Minimal — video only, all outputs
python analyse.py --video fight.mov

# Quick check — no outputs, just jab counts printed
python analyse.py --video fight.mov --no-render --no-excel --no-csv

# First 60 seconds only
python analyse.py --video fight.mov --duration 60

# With IMU, manual sync offsets, IMU bars on video
python analyse.py --video fight.mov \
  --imu-r imu_right.csv --imu-l imu_left.csv \
  --imu-analysis --sync --offset-r 9.4 --offset-l 11.0

# With IMU, auto sync via jump calibration (boxer jumps between t=5s and t=25s)
python analyse.py --video fight.mov \
  --imu-r imu_right.csv --imu-l imu_left.csv \
  --imu-analysis --sync --sync-auto --jump-window 5 25

# YOLO model, custom output location
python analyse.py --video fight.mov --model yolo --out /tmp/analysis/fight

# IMU only on right wrist, no video render
python analyse.py --video fight.mov \
  --imu-r imu_right.csv --imu-analysis \
  --sync --offset-r 9.4 --no-render
```

---

## Outputs

| File | Description |
|------|-------------|
| `<stem>.mp4` | Annotated video — skeleton overlay, HUD bars (speed, elbow angle, shoulder-wrist distance), punch phase overlays, optional IMU acceleration bars |
| `<stem>_punches.json` | Machine-readable punch records — used by boxing_app to populate the punch table |
| `<stem>.xlsx` | Three sheets: per-frame signals, detected jabs with full metrics, rejected peaks with rejection reasons |
| `<stem>.tracking.csv` | Per-frame joint positions (x, y for 12 joints) + signals + punch IDs |
| `<stem>_sync.json` | Computed sync offsets and matched jump event timestamps (only written when `--sync` is used) |

---

## Pipeline

The analysis runs as two passes to improve accuracy:

1. **Pass 1 — Landmark extraction** — pose estimation runs on every frame. A state machine (CALIBRATING → TRACKING → OCCLUDED) locks onto the boxer and filters out other people in frame
2. **Smooth + interpolate** — Gaussian smoothing and short-gap interpolation on all joint trajectories
3. **Signal computation** — wrist speed (px/s), shoulder-to-wrist distance (`d_sw`), elbow angle
4. **Pass 1 jab detection** — initial jab detection to locate where punches happen in the frame
5. **Shoulder zone filter** — derives a bounding zone from pass-1 punch positions and nulls out frames where the detected person is outside it (removes tracking noise and wrong-person frames)
6. **Re-smooth** — smoothing repeated on the filtered skeleton
7. **Pass 2 jab detection** — final jab detection on the clean signal
8. **Sync** (optional) — matches jump events between video hip trajectory and IMU free-fall windows to compute time offset
9. **Render outputs** — annotated video, punch JSON, Excel, CSV

---

## Structure

```
video_analysis/
├── analyse.py              entry point / CLI
├── core/
│   ├── landmarks.py        pose extraction (MediaPipe + YOLO), boxer tracker
│   ├── signals.py          signal computation (speed, d_sw, elbow angle, hip-Y)
│   ├── jab_detect.py       jab detection and shoulder zone filter
│   └── sync.py             video↔IMU synchronisation via jump events
├── output/
│   ├── video_writer.py     annotated video renderer
│   ├── excel.py            Excel export
│   └── csv_export.py       tracking CSV export
└── boxing_analytics/
    └── core/
        ├── imu.py          IMU data loader — IMUData dataclass, IMUProcessor
        └── utils.py        signal utilities used by imu.py
```
