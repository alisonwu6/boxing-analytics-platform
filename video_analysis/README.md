# Video Analysis

Standalone CLI for boxing video analysis. Takes a video (and optional IMU files) and outputs an annotated video, punch data, Excel report, and tracking CSV.

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
pip install -r requirements.txt
```

Or manually:

```bash
pip install mediapipe>=0.10 opencv-python>=4.13 numpy>=2.0 openpyxl>=3.1 pandas>=2.0 scipy>=1.15
```

### 4. Verify setup

```bash
python analyse.py --video your_video.mp4 --no-render --no-excel --no-csv
```

You should see landmark extraction start and a punch count printed at the end.

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
| `--video <path>` | required | Path to the input video file (.mov, .mp4, .avi) |
| `--out <stem>` | same as video, no extension | Output file stem. All output files use `<stem>.mp4`, `<stem>.xlsx`, etc. |
| `--duration <s>` | full video | Only analyse the first N seconds |
| `--start <s>` | 0 | Start analysis at this timestamp (seconds) |
| `--end <s>` | full video | Stop analysis at this timestamp (seconds) |

### Pose Model

| Flag | Default | Description |
|------|---------|-------------|
| `--model-path <path>` | auto-detected | Explicit path to `pose_landmarker_heavy.task`. By default the script searches in the `video_analysis/` directory |

### Punch Detection

| Flag | Default | Description |
|------|---------|-------------|
| `--punch-type jab\|uppercut` | `jab` | Which punch type to detect and annotate |

### IMU Data

| Flag | Default | Description |
|------|---------|-------------|
| `--imu-r <path>` | none | Path to the right-wrist IMU CSV file |
| `--imu-l <path>` | none | Path to the left-wrist IMU CSV file |
| `--imu-analysis` | off | Render IMU acceleration bars on the annotated video. Requires at least one of `--imu-r` or `--imu-l` |

The IMU CSV is expected to have columns: `TimeStamp(s)`, `LinAccX(g)`, `LinAccY(g)`, `LinAccZ(g)`.

### Synchronisation

IMU sensors and the camera have independent clocks. These flags align them.

| Flag | Default | Description |
|------|---------|-------------|
| `--sync` | off | Enable sync offset computation |
| `--sync-auto` | off | Auto-detect sync offset by matching jump events between video and IMU. Requires `--sync` and `--jump-window` |
| `--jump-window <t0> <t1>` | none | Time range in seconds to search for jump events (e.g. `5 25`). Required with `--sync-auto` |
| `--offset-r <s>` | none | Manual IMU-R offset in seconds. Meaning: `imu_timestamp - offset = video_timestamp` |
| `--offset-l <s>` | none | Manual IMU-L offset in seconds |

### Output Control

| Flag | Description |
|------|-------------|
| `--no-render` | Skip the annotated video. Landmark extraction still runs but the slow per-frame render is skipped |
| `--no-excel` | Skip the Excel export |
| `--no-csv` | Skip the per-frame tracking CSV |

---

## Examples

```bash
# Minimal — video only, all outputs
python analyse.py --video fight.mov

# Quick check — no outputs, just punch counts printed
python analyse.py --video fight.mov --no-render --no-excel --no-csv

# First 60 seconds only
python analyse.py --video fight.mov --duration 60

# Specific clip window
python analyse.py --video fight.mov --start 10 --end 70

# Detect uppercuts instead of jabs
python analyse.py --video fight.mov --punch-type uppercut

# With IMU, manual sync offsets, IMU bars on video
python analyse.py --video fight.mov \
  --imu-r imu_right.csv --imu-l imu_left.csv \
  --imu-analysis --sync --offset-r 9.4 --offset-l 11.0

# With IMU, auto sync via jump calibration (boxer jumps between t=5s and t=25s)
python analyse.py --video fight.mov \
  --imu-r imu_right.csv --imu-l imu_left.csv \
  --imu-analysis --sync --sync-auto --jump-window 5 25

# Custom output location, no CSV
python analyse.py --video fight.mov --out /tmp/analysis/fight --no-csv
```

---

## Outputs

| File | Description |
|------|-------------|
| `<stem>.mp4` | Annotated video with skeleton overlay, HUD bars (speed, elbow angle, shoulder-wrist distance), punch phase overlays, and optional IMU acceleration bars |
| `<stem>_punches.json` | Machine-readable punch records used by the boxing app to populate the punch table |
| `<stem>.xlsx` | Three sheets: per-frame signals, detected punches with full metrics, rejected peaks with rejection reasons |
| `<stem>.tracking.csv` | Per-frame joint positions (x, y for 12 joints) plus signals and punch IDs |
| `<stem>_sync.json` | Computed sync offsets and matched jump event timestamps (only written when `--sync` is used) |

---

## Pipeline

The analysis runs in two passes to improve accuracy:

1. **Pass 1 - Landmark extraction** - pose estimation runs on every frame. A state machine (CALIBRATING, TRACKING, OCCLUDED) locks onto the boxer and filters out other people in frame
2. **Smooth + interpolate** - Gaussian smoothing and short-gap interpolation on all joint trajectories
3. **Signal computation** - wrist speed (px/s), shoulder-to-wrist distance, elbow angle, 3D arm extension via law of cosines
4. **Pass 1 punch detection** - initial detection to locate where punches happen in the frame
5. **Shoulder zone filter** - derives a bounding zone from pass-1 punch positions and nulls out frames where the detected person is outside it
6. **Re-smooth** - smoothing repeated on the filtered skeleton
7. **Pass 2 punch detection** - final detection on the clean signal
8. **Sync** (optional) - matches jump events between video hip trajectory and IMU free-fall windows to compute time offset
9. **Render outputs** - annotated video, punch JSON, Excel, CSV

---

## Structure

```
video_analysis/
├── analyse.py                  entry point and CLI
├── core/
│   ├── landmarks.py            pose extraction (MediaPipe), boxer tracker state machine
│   ├── signals.py              signal computation (speed, d_sw, elbow angle, 3D extension, hip-Y)
│   ├── jab_detect.py           jab detection and shoulder zone filter
│   ├── uppercut_detect.py      uppercut detection
│   └── sync.py                 video and IMU synchronisation via jump events
├── output/
│   ├── video_writer.py         annotated video renderer
│   ├── excel.py                Excel export
│   └── csv_export.py           tracking CSV export
└── boxing_analytics/
    └── core/
        ├── imu.py              IMU data loader
        └── utils.py            signal utilities
```
