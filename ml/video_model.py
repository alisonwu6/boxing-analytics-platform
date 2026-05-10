"""
Video / MOV inference module.

<<<<<<< HEAD
<<<<<<< HEAD
This connects the existing backend S3 workflow to the standalone
video_analysis/analyse.py CLI.

Expected project structure:

boxing-analytics-platform/
├─ backend/
├─ frontend/
└─ ml/
   ├─ video_model.py
   └─ video_analysis/
      ├─ analyse.py
      ├─ core/
      ├─ output/
      └─ pose_landmarker_heavy.task

Flow:
1. Download MOV from S3 into a temporary folder.
2. Optionally download CSV from S3 and pass it to analyse.py only when IMU/sync is enabled.
3. Run the standalone Python video analysis command.
4. Convert the annotated MP4 to browser-friendly H.264 if ffmpeg is available.
5. Upload generated artifacts back to S3.
=======
Downloads the boxing session video and IMU CSV from S3, runs the
Video + IMU sync framework to produce an annotated output video,
converts it to browser-compatible H.264 MP4, then uploads the result back to S3.

Returns only artifact references. Numeric punch data comes from imu_model.py.
>>>>>>> parent of a2d533c (update)
=======
Downloads the boxing session video and IMU CSV from S3, runs the
Video + IMU sync framework to produce an annotated output video,
converts it to browser-compatible H.264 MP4, then uploads the result back to S3.

Returns only artifact references. Numeric punch data comes from imu_model.py.
>>>>>>> parent of a2d533c (update)
"""

import os
import sys
import tempfile
import subprocess

import boto3


def infer(bucket: str, region: str, mov_key: str, csv_key: str, session_id: str) -> dict:
    """
    Download MOV + CSV from S3, produce an annotated video, convert it to
    browser-compatible H.264 MP4, and upload it back to S3.

    Args:
        bucket: S3 bucket name
        region: AWS region
        mov_key: S3 key of the original video file
        csv_key: S3 key of the IMU CSV file
        session_id: session identifier used to build the output S3 key

<<<<<<< HEAD
<<<<<<< HEAD
def _project_root() -> Path:
    """Find the repository root robustly from ml/video_model.py."""
    current = Path(__file__).resolve()

    for parent in [current.parent, *current.parents]:
        if (parent / "backend").exists() and (parent / "ml").exists():
            return parent

    # Fallback for the normal structure: project_root/ml/video_model.py
    if current.parent.name == "ml":
        return current.parent.parent

    return current.parents[1]
=======
    Returns:
        dict:
            annotatedVideoKey: S3 key of the annotated output MP4
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
>>>>>>> parent of a2d533c (update)

    from video_analysis.boxing_analytics.pipeline import run_pipeline

<<<<<<< HEAD
def _video_analysis_dir() -> Path:
    """Locate the standalone video_analysis folder. It must contain analyse.py."""
    project_root = _project_root()
    env_path = os.environ.get("VIDEO_ANALYSIS_DIR")

    candidates = []
    if env_path:
        candidates.append(Path(env_path))

    candidates.extend(
        [
            project_root / "ml" / "video_analysis",
            project_root / "video_analysis",
            Path(__file__).resolve().parent / "video_analysis",
        ]
    )

    for candidate in candidates:
        if (candidate / "analyse.py").exists():
            return candidate

    checked = "\n".join(str(path) for path in candidates)
    raise FileNotFoundError("Video analysis directory not found. Checked:\n" + checked)
=======
    s3 = boto3.client("s3", region_name=region)
>>>>>>> parent of a2d533c (update)

    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "input.mov")
        csv_path = os.path.join(tmp_dir, "imu.csv")
        out_dir = os.path.join(tmp_dir, "output")

        os.makedirs(out_dir, exist_ok=True)

        print(f"[VideoModel] Downloading MOV from S3: {mov_key}", file=sys.stderr)

        with open(video_path, "wb") as f:
            s3.download_fileobj(bucket, mov_key, f)

        print(f"[VideoModel] Downloading CSV from S3: {csv_key}", file=sys.stderr)

        with open(csv_path, "wb") as f:
            s3.download_fileobj(bucket, csv_key, f)

        old_stdout = sys.stdout
        sys.stdout = sys.stderr

        try:
            run_pipeline(
                video_path=video_path,
                imu_r_path=csv_path,
                imu_l_path=None,
                out_dir=out_dir,
                write_video=True,
            )
        finally:
            sys.stdout = old_stdout

        annotated_path = os.path.join(out_dir, "input_annotated.mp4")

<<<<<<< HEAD
def _build_child_env() -> dict:
    """
    Build environment for analyse.py.

    analyse.py and its modules import local packages like:
      from core.landmarks import ...
      from output.video_writer import ...

    Therefore Python must be able to see the video_analysis folder.
    """
    env = os.environ.copy()
    project_root = _project_root()
    video_analysis_dir = _video_analysis_dir()

    candidate_paths = [
        project_root,
        project_root / "ml",
        video_analysis_dir,
        video_analysis_dir.parent,
    ]

    existing = env.get("PYTHONPATH")
    if existing:
        for item in existing.split(os.pathsep):
            if item:
                candidate_paths.append(Path(item))

    paths = []
    for path in candidate_paths:
        if path.exists():
            path_text = str(path)
            if path_text not in paths:
                paths.append(path_text)

    env["PYTHONPATH"] = os.pathsep.join(paths)

    print("[VideoModel] Project root:", project_root, file=sys.stderr)
    print("[VideoModel] Video analysis dir:", video_analysis_dir, file=sys.stderr)
    print("[VideoModel] Analyse script:", _analyse_script(), file=sys.stderr)
    print("[VideoModel] PYTHONPATH for video analysis:", env["PYTHONPATH"], file=sys.stderr)

    return env


def _run_video_cli(
    video_path: Path,
    csv_path: Optional[Path],
    out_stem: Path,
    video_options: Optional[dict] = None,
) -> None:
    video_options = video_options or {}
    script = _analyse_script()
    video_analysis_dir = _video_analysis_dir()

    if not video_analysis_dir.exists():
        raise FileNotFoundError(f"Video analysis directory not found: {video_analysis_dir}")
    if not script.exists():
        raise FileNotFoundError(f"Video analysis script not found: {script}")
    if not (video_analysis_dir / "core").exists():
        raise FileNotFoundError(f"Video analysis core folder not found: {video_analysis_dir / 'core'}")
    if not (video_analysis_dir / "output").exists():
        raise FileNotFoundError(f"Video analysis output folder not found: {video_analysis_dir / 'output'}")

    model = video_options.get("model", "mediapipe")
    duration = video_options.get("duration")
    imu_analysis = bool(video_options.get("imu_analysis", False))
    sync = bool(video_options.get("sync", False))
    sync_auto = bool(video_options.get("sync_auto", False))
    jump_window = video_options.get("jump_window")
    offset_r = video_options.get("offset_r")
    offset_l = video_options.get("offset_l")
    render_video = video_options.get("render_video", True)
    export_excel = video_options.get("export_excel", True)
    export_csv = video_options.get("export_csv", True)

    command = [
        sys.executable,
        str(script),
        "--video",
        str(video_path),
        "--out",
        str(out_stem),
        "--model",
        str(model),
    ]

    model_path = os.environ.get("VIDEO_MODEL_PATH")
    if model_path:
        command.extend(["--model-path", model_path])

    if duration is not None:
        command.extend(["--duration", str(duration)])

    # Do not pass --imu-r just because a CSV exists. analyse.py loads IMU as soon
    # as --imu-r/--imu-l is present. Only pass it when the user explicitly enabled
    # IMU overlay or sync.
    should_use_imu = bool(csv_path and (imu_analysis or sync))

    if should_use_imu:
        command.extend(["--imu-r", str(csv_path)])

    if should_use_imu and imu_analysis:
        command.append("--imu-analysis")

    if should_use_imu and sync:
        command.append("--sync")
        if sync_auto:
            if not jump_window or len(jump_window) != 2:
                raise ValueError("Auto sync requires jump_window with [start, end].")
            command.append("--sync-auto")
            command.extend(["--jump-window", str(jump_window[0]), str(jump_window[1])])
        else:
            if offset_r is not None:
                command.extend(["--offset-r", str(offset_r)])
            if offset_l is not None:
                command.extend(["--offset-l", str(offset_l)])

    if not render_video:
        command.append("--no-render")
    if not export_excel:
        command.append("--no-excel")
    if not export_csv:
        command.append("--no-csv")

    print("[VideoModel] Running video analysis command:", " ".join(command), file=sys.stderr)

    result = subprocess.run(
        command,
        cwd=str(video_analysis_dir),
        env=_build_child_env(),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.stdout:
        print(result.stdout, file=sys.stderr)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    if result.returncode != 0:
        raise RuntimeError(
            f"Video analysis failed with exit code {result.returncode}. "
            f"{result.stderr[-1500:].strip()}"
        )


def _convert_to_browser_mp4(input_path: Path, output_path: Path) -> Path:
    ffmpeg_bin = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")

    if not ffmpeg_bin:
        print("[VideoModel] ffmpeg was not found. Uploading original MP4 output instead.", file=sys.stderr)
        return input_path

    command = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(input_path),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(output_path),
    ]

    print("[VideoModel] Converting video for browser playback:", " ".join(command), file=sys.stderr)

    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        print("[VideoModel] ffmpeg command failed to start. Uploading original MP4 output instead.", file=sys.stderr)
        return input_path

    if result.returncode != 0 or not output_path.exists():
        print("[VideoModel] ffmpeg conversion failed. Uploading original MP4 output instead.", file=sys.stderr)
        print(result.stderr[-1000:], file=sys.stderr)
        return input_path

    return output_path


def _read_video_punch_events(punch_json_path: Path) -> list:
    if not punch_json_path.exists():
        return []

    try:
        data = json.loads(punch_json_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[VideoModel] Could not read punch JSON: {exc}", file=sys.stderr)
        return []

    events = []
    for item in data.get("punches", []):
        events.append(
            {
                "eventId": item.get("id"),
                "t": item.get("time_s"),
                "hand": item.get("hand"),
                "type": item.get("type", "jab"),
                "startTime": item.get("start_t_s"),
                "endTime": item.get("end_t_s"),
                "forwardTimeMs": item.get("fwd_ms"),
                "retractionTimeMs": item.get("ret_ms"),
                "speedPx": item.get("speed_px"),
            }
        )

    return events


def infer(
    bucket: str,
    region: str,
    mov_key: str,
    csv_key: Optional[str],
    session_id: str,
    video_options: Optional[dict] = None,
) -> dict:
    video_options = video_options or {}
    s3 = boto3.client("s3", region_name=region)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        input_dir = tmp_dir / "input"
        output_dir = tmp_dir / "output"
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        video_path = input_dir / f"input{_input_suffix(mov_key, '.mov')}"
        csv_path = input_dir / "imu.csv" if csv_key else None
        out_stem = output_dir / "analysis"

        _download_s3_file(s3, bucket, mov_key, video_path)
        if csv_key and csv_path:
            _download_s3_file(s3, bucket, csv_key, csv_path)

        _run_video_cli(video_path=video_path, csv_path=csv_path, out_stem=out_stem, video_options=video_options)

        raw_video_path = out_stem.with_suffix(".mp4")
        if not raw_video_path.exists():
            raise FileNotFoundError(f"Annotated video output not found: {raw_video_path}")

        browser_video_path = output_dir / "analysis_browser.mp4"
        upload_video_path = _convert_to_browser_mp4(raw_video_path, browser_video_path)

        expected_outputs = {
            "annotatedVideoKey": upload_video_path,
            "videoPunchJsonKey": output_dir / "analysis_punches.json",
            "videoReportExcelKey": out_stem.with_suffix(".xlsx"),
            "videoTrackingCsvKey": Path(str(out_stem) + ".tracking.csv"),
            "videoSyncJsonKey": output_dir / "analysis_sync.json",
        }

        output_prefix = f"outputs/{session_id}/video"
        upload_names = {
            "annotatedVideoKey": "annotated_video.mp4",
            "videoPunchJsonKey": "punches.json",
            "videoReportExcelKey": "report.xlsx",
            "videoTrackingCsvKey": "tracking.csv",
            "videoSyncJsonKey": "sync.json",
        }

        artifacts = {}
        for artifact_name, local_path in expected_outputs.items():
            if not local_path.exists():
                continue
            s3_key = f"{output_prefix}/{upload_names[artifact_name]}"
            _upload_s3_file(s3, bucket, local_path, s3_key, _CONTENT_TYPES[artifact_name])
            artifacts[artifact_name] = s3_key

        video_punch_events = _read_video_punch_events(expected_outputs["videoPunchJsonKey"])
=======
        if not os.path.exists(annotated_path):
            raise FileNotFoundError(f"Annotated video not found: {annotated_path}")

        browser_video_path = os.path.join(out_dir, "annotated_video_browser.mp4")

        ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")

        print(f"[VideoModel] Original annotated video: {annotated_path}", file=sys.stderr)
        print(f"[VideoModel] Using ffmpeg: {ffmpeg_bin}", file=sys.stderr)
        print(
            "[VideoModel] Converting annotated video to H.264 browser MP4...",
            file=sys.stderr,
        )

        ffmpeg_result = subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                annotated_path,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-an",
                browser_video_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        if ffmpeg_result.returncode != 0:
            print("[VideoModel] ffmpeg stdout:", ffmpeg_result.stdout, file=sys.stderr)
            print("[VideoModel] ffmpeg stderr:", ffmpeg_result.stderr, file=sys.stderr)
            raise RuntimeError(
                "ffmpeg conversion failed. Browser video was not generated."
            )

        if not os.path.exists(browser_video_path):
            raise FileNotFoundError(
                f"Browser-compatible video not found: {browser_video_path}"
            )

        print(
            "[VideoModel] Converted annotated video to browser-compatible H.264 MP4",
            file=sys.stderr,
        )
>>>>>>> parent of a2d533c (update)

=======
    Returns:
        dict:
            annotatedVideoKey: S3 key of the annotated output MP4
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from video_analysis.boxing_analytics.pipeline import run_pipeline

    s3 = boto3.client("s3", region_name=region)

    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "input.mov")
        csv_path = os.path.join(tmp_dir, "imu.csv")
        out_dir = os.path.join(tmp_dir, "output")

        os.makedirs(out_dir, exist_ok=True)

        print(f"[VideoModel] Downloading MOV from S3: {mov_key}", file=sys.stderr)

        with open(video_path, "wb") as f:
            s3.download_fileobj(bucket, mov_key, f)

        print(f"[VideoModel] Downloading CSV from S3: {csv_key}", file=sys.stderr)

        with open(csv_path, "wb") as f:
            s3.download_fileobj(bucket, csv_key, f)

        old_stdout = sys.stdout
        sys.stdout = sys.stderr

        try:
            run_pipeline(
                video_path=video_path,
                imu_r_path=csv_path,
                imu_l_path=None,
                out_dir=out_dir,
                write_video=True,
            )
        finally:
            sys.stdout = old_stdout

        annotated_path = os.path.join(out_dir, "input_annotated.mp4")

        if not os.path.exists(annotated_path):
            raise FileNotFoundError(f"Annotated video not found: {annotated_path}")

        browser_video_path = os.path.join(out_dir, "annotated_video_browser.mp4")

        ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")

        print(f"[VideoModel] Original annotated video: {annotated_path}", file=sys.stderr)
        print(f"[VideoModel] Using ffmpeg: {ffmpeg_bin}", file=sys.stderr)
        print(
            "[VideoModel] Converting annotated video to H.264 browser MP4...",
            file=sys.stderr,
        )

        ffmpeg_result = subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                annotated_path,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-an",
                browser_video_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        if ffmpeg_result.returncode != 0:
            print("[VideoModel] ffmpeg stdout:", ffmpeg_result.stdout, file=sys.stderr)
            print("[VideoModel] ffmpeg stderr:", ffmpeg_result.stderr, file=sys.stderr)
            raise RuntimeError(
                "ffmpeg conversion failed. Browser video was not generated."
            )

        if not os.path.exists(browser_video_path):
            raise FileNotFoundError(
                f"Browser-compatible video not found: {browser_video_path}"
            )

        print(
            "[VideoModel] Converted annotated video to browser-compatible H.264 MP4",
            file=sys.stderr,
        )

>>>>>>> parent of a2d533c (update)
        output_key = f"outputs/{session_id}/annotated_video.mp4"

        print(f"[VideoModel] Uploading browser MP4 to S3: {output_key}", file=sys.stderr)

        with open(browser_video_path, "rb") as f:
            s3.upload_fileobj(
                f,
                bucket,
                output_key,
                ExtraArgs={
                    "ContentType": "video/mp4",
                    "ContentDisposition": "inline",
                },
            )

    return {
<<<<<<< HEAD
<<<<<<< HEAD
        "artifacts": artifacts,
        "videoPunchEvents": video_punch_events,
        "resultSummary": [
            f"Video analysis completed with {len(video_punch_events)} video-detected punches."
        ],
    }
=======
        "annotatedVideoKey": output_key,
    }
>>>>>>> parent of a2d533c (update)
=======
        "annotatedVideoKey": output_key,
    }
>>>>>>> parent of a2d533c (update)
