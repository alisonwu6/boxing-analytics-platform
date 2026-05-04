"""
Video / MOV inference module.

Downloads the boxing session video and IMU CSV from S3, runs the
Video + IMU sync framework to produce an annotated output video,
converts it to browser-compatible H.264 MP4, then uploads the result back to S3.

Returns only artifact references. Numeric punch data comes from imu_model.py.
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
        "annotatedVideoKey": output_key,
    }