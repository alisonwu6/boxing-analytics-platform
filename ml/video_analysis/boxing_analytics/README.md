# Boxing Analytics

A Python package for synchronising wrist IMU sensor data with boxing video footage.

The primary focus of this tool is **temporal synchronisation** — aligning the IMU sensor clocks with the video clock so that wrist acceleration data can be analysed in the context of what is happening on screen.

Punch detection and classification is included but is **currently a work in progress**. The detection pipeline runs and produces output, but results are not yet reliable enough for production use. MediaPipe pose estimation is required for punch-related features.

---

## How It Works

1. The boxer performs 2–3 visible jumps at the start of the session
2. The tool detects these jumps independently in the video (via pose estimation) and in each IMU signal (via free-fall windows)
3. Matching the same jump across signals gives the time offset between clocks
4. All data is aligned to video time and exported

---

## Requirements

Python 3.8 or later.

```bash
pip install numpy opencv-python openpyxl matplotlib mediapipe
```

**MediaPipe is required** for skeleton tracking and punch detection. Without it the synchronisation pipeline still runs using OpenCV background subtraction, but punch detection will not be available.

---

## Input Files

| Input | Format | Notes |
|---|---|---|
| Video | `.mp4` | Must contain 2–3 visible jump events |
| IMU — right wrist | `.xlsx` or `.csv` | Columns: TimeStamp, AccX, AccY, AccZ, GyroX, GyroY, GyroZ |
| IMU — left wrist | `.xlsx` or `.csv` | Same format — optional |

The IMU column names are auto-detected from headers. Both standard and strict OOXML `.xlsx` formats are supported.

---

## Getting Started (From Scratch)

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/boxing-analytics.git
cd boxing-analytics
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Mac / Linux
venv\Scripts\activate           # Windows
```

### 3. Install dependencies

```bash
pip install numpy opencv-python openpyxl matplotlib mediapipe
```

### 4. Prepare your files

You need:
- A video file (`.mp4`) where the boxer performs 2–3 visible jumps at the start
- At least one IMU data file (`.xlsx` or `.csv`) from the right wrist sensor
- Optionally a second IMU file for the left wrist

### 5. Run

```bash
python -m boxing_analytics.main \
    --video   footage.mp4 \
    --imu_r   right_wrist.xlsx \
    --imu_l   left_wrist.xlsx \
    --out_dir output/
```

Results will appear in the `output/` folder once complete.

---

## Basic Usage

```bash
python -m boxing_analytics.main \
    --video   footage.mp4 \
    --imu_r   right_wrist.xlsx \
    --imu_l   left_wrist.xlsx \
    --out_dir output/
```

Single sensor (right wrist only):

```bash
python -m boxing_analytics.main \
    --video  footage.mp4 \
    --imu_r  right_wrist.xlsx \
    --out_dir output/
```

---

## Output Files

All files are written to `--out_dir` and named after the input video:

| File | Description |
|---|---|
| `<video>_annotated.mp4` | Original video with skeleton overlay and live IMU acceleration chart |
| `<video>_sync_comparison.png` | Multi-panel plot: video signal, IMU-R, IMU-L, fused signal with jump markers |
| `<video>_data.xlsx` | Sync offsets, jump events, video kinematics, IMU data, and fused 200 Hz signal |

---

## All CLI Options

### Input

| Argument | Default | Description |
|---|---|---|
| `--video` | required | Path to input video file |
| `--imu_r` | `None` | Right-wrist IMU file (`.xlsx` or `.csv`) |
| `--imu_l` | `None` | Left-wrist IMU file — optional |

### Output

| Argument | Default | Description |
|---|---|---|
| `--out_dir` | `.` | Directory to write all output files |
| `--no_video_out` | — | Skip annotated video (faster for testing) |

### Analysis Window

| Argument | Default | Description |
|---|---|---|
| `--t_start` | `0.0` | Start of analysis window (s) |
| `--t_end` | `30.0` | End of analysis window (s) |

### Sync Calibration

| Argument | Default | Description |
|---|---|---|
| `--n_jumps` | `3` | Number of calibration jumps to detect |
| `--offset_r` | `None` | Manually override Video→IMU-R offset (s) |
| `--offset_l` | `None` | Manually override Video→IMU-L offset (s) |
| `--imu_t0` | `10.0` | Start of IMU jump search window (s, raw IMU clock) |
| `--imu_t1` | `35.0` | End of IMU jump search window (s, raw IMU clock) |
| `--vid_search` | `25.0` | How many seconds of video to search for jumps |
| `--vid_stop` | `None` | Stop reading video after this many seconds |

### Pose Backend

| Argument | Default | Options |
|---|---|---|
| `--pose_backend` | `auto` | `auto` — tries MediaPipe first, falls back to OpenCV |
| | | `mediapipe` — force full skeleton tracking |
| | | `opencv` — force background subtraction fallback |

---

## Common Examples

**Quick test — skip video output:**
```bash
python -m boxing_analytics.main \
    --video footage.mp4 \
    --imu_r right.xlsx \
    --no_video_out
```

**Manual offset override (when auto-detection is unreliable):**
```bash
python -m boxing_analytics.main \
    --video footage.mp4 \
    --imu_r right.xlsx \
    --imu_l left.xlsx \
    --offset_r 9.563 \
    --offset_l 11.198
```

**Long session — jumps only in first 30 seconds:**
```bash
python -m boxing_analytics.main \
    --video session.mp4 \
    --imu_r right.xlsx \
    --imu_l left.xlsx \
    --vid_stop 35.0 \
    --t_end 30.0
```

**No MediaPipe installed:**
```bash
python -m boxing_analytics.main \
    --video footage.mp4 \
    --imu_r right.xlsx \
    --pose_backend opencv
```

---

## Package Structure

```
boxing_analytics/
├── main.py            CLI entry point
├── pipeline.py        Orchestrates the full processing pipeline
├── core/
│   ├── video.py       Video processing — MediaPipe and OpenCV backends
│   ├── imu.py         IMU data loading and cleaning (.xlsx / .csv)
│   ├── sync.py        Jump detection, offset computation, data fusion
│   ├── skeleton.py    Skeleton drawing on video frames
│   ├── wrist.py       Punch detection and classification from IMU
│   └── utils.py       Signal processing utilities
└── output/
    ├── annotated_video.py    Annotated MP4 writer
    ├── visualizer.py         Sync comparison plot
    └── excel_export.py       Excel data export
```

---

## Punch Detection — Work in Progress

> **Note:** Punch detection is currently under active development. The pipeline runs and classifies punches into three types, but classification accuracy is not yet at a desirable level. Use these results for exploratory analysis only.

The wrist module uses a four-stage pipeline on IMU linear acceleration and gyroscope data:

| Stage | Description |
|---|---|
| 1. Magnitude gate | Filters candidates above impact threshold |
| 2. Axis dominance | Ensures the event is directional, not omnidirectional |
| 3. Gyroscope check | Confirms wrist rotation consistent with a punch |
| 4. Classification | Labels as `straight`, `hook`, or `uppercut` |

**MediaPipe is required** for punch detection to work correctly, as wrist kinematics from pose estimation are used alongside the IMU signal.

Planned improvements:
- Better threshold tuning across different boxers and sensor placements
- Ground-truth validation against labelled video
- Improved handling of guard movements and non-punch high-impact events
