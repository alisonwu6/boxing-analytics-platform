"""
Video / MOV inference module.

This connects the existing backend S3 workflow to the newer standalone
video_analysis/analyse.py CLI.

Flow:
1. Download MOV from S3 into a temporary folder.
2. Optionally download CSV from S3 and pass it to analyse.py as --imu-r.
3. Run the standalone Python video analysis command.
4. Convert the annotated MP4 to browser-friendly H.264 if ffmpeg is available.
5. Upload generated artifacts back to S3.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import boto3


_CONTENT_TYPES = {
    "annotatedVideoKey": "video/mp4",
    "videoPunchJsonKey": "application/json",
    "videoReportExcelKey": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "videoTrackingCsvKey": "text/csv",
    "videoSyncJsonKey": "application/json",
}


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _video_analysis_dir() -> Path:
    return _project_root() / "video_analysis"


def _analyse_script() -> Path:
    return _video_analysis_dir() / "analyse.py"


def _download_s3_file(s3, bucket: str, key: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"[VideoModel] Downloading s3://{bucket}/{key} -> {local_path}", file=sys.stderr)
    s3.download_file(bucket, key, str(local_path))


def _upload_s3_file(s3, bucket: str, local_path: Path, key: str, content_type: str) -> None:
    print(f"[VideoModel] Uploading {local_path} -> s3://{bucket}/{key}", file=sys.stderr)
    s3.upload_file(
        str(local_path),
        bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "ContentDisposition": "inline" if content_type.startswith("video/") else "attachment",
        },
    )


def _input_suffix(s3_key: str, fallback: str) -> str:
    suffix = Path(s3_key).suffix.lower()
    return suffix if suffix else fallback


def _build_child_env() -> dict:
    env = os.environ.copy()

    paths = [
        str(_video_analysis_dir()),
        str(_project_root() / "ml" / "video_analysis"),
    ]

    existing = env.get("PYTHONPATH")
    if existing:
        paths.append(existing)

    env["PYTHONPATH"] = os.pathsep.join(paths)
    return env


def _run_video_cli(video_path: Path, csv_path: Optional[Path], out_stem: Path) -> None:
    script = _analyse_script()

    if not script.exists():
        raise FileNotFoundError(f"Video analysis script not found: {script}")

    command = [
        sys.executable,
        str(script),
        "--video",
        str(video_path),
        "--out",
        str(out_stem),
        "--model",
        os.environ.get("VIDEO_POSE_MODEL", "mediapipe"),
    ]

    model_path = os.environ.get("VIDEO_MODEL_PATH")
    if model_path:
        command.extend(["--model-path", model_path])

    duration = os.environ.get("VIDEO_ANALYSIS_DURATION_SECS")
    if duration:
        command.extend(["--duration", duration])

    if csv_path:
        command.extend(["--imu-r", str(csv_path), "--imu-analysis"])

        offset_r = os.environ.get("VIDEO_OFFSET_R")
        jump_window = os.environ.get("VIDEO_SYNC_JUMP_WINDOW")

        if offset_r:
            command.extend(["--sync", "--offset-r", offset_r])
        elif jump_window:
            parts = jump_window.replace(",", " ").split()

            if len(parts) == 2:
                command.extend([
                    "--sync",
                    "--sync-auto",
                    "--jump-window",
                    parts[0],
                    parts[1],
                ])
            else:
                raise ValueError("VIDEO_SYNC_JUMP_WINDOW must look like '5 25'")

    print("[VideoModel] Running video analysis command:", " ".join(command), file=sys.stderr)

    result = subprocess.run(
        command,
        cwd=str(_video_analysis_dir()),
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
            f"{result.stderr[-1000:].strip()}"
        )


def _convert_to_browser_mp4(input_path: Path, output_path: Path) -> Path:
    ffmpeg_bin = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")

    if not ffmpeg_bin:
        print(
            "[VideoModel] ffmpeg was not found. Uploading original MP4 output instead.",
            file=sys.stderr,
        )
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
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        print(
            "[VideoModel] ffmpeg command failed to start. Uploading original MP4 output instead.",
            file=sys.stderr,
        )
        return input_path

    if result.returncode != 0 or not output_path.exists():
        print(
            "[VideoModel] ffmpeg conversion failed. Uploading original MP4 output instead.",
            file=sys.stderr,
        )
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
) -> dict:
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

        _run_video_cli(
            video_path=video_path,
            csv_path=csv_path,
            out_stem=out_stem,
        )

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

            _upload_s3_file(
                s3,
                bucket,
                local_path,
                s3_key,
                _CONTENT_TYPES[artifact_name],
            )

            artifacts[artifact_name] = s3_key

        video_punch_events = _read_video_punch_events(
            expected_outputs["videoPunchJsonKey"]
        )

    return {
        "artifacts": artifacts,
        "videoPunchEvents": video_punch_events,
        "resultSummary": [
            f"Video analysis completed with {len(video_punch_events)} video-detected jabs."
        ],
    }