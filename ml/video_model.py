"""
Video / MOV inference module.

Downloads the boxing session video and IMU CSV from S3, runs the
Video + IMU sync framework to produce an annotated output video,
then uploads the result back to S3.

Returns only artifact references — all numeric punch data comes from imu_model.
"""

import os
import sys
import tempfile
import subprocess

import boto3


def infer(bucket: str, region: str, mov_key: str, csv_key: str, session_id: str) -> dict:
    """
    Download MOV + CSV from S3, produce an annotated video, upload back to S3.

    Args:
        bucket:     S3 bucket name
        region:     AWS region
        mov_key:    S3 key of the original MOV file
        csv_key:    S3 key of the IMU CSV file (needed for video-IMU sync)
        session_id: session identifier, used to build the output S3 key

    Returns:
        dict of artifact references to store in session results:
            annotatedVideoKey (str) — S3 key of the annotated output MP4
    """
    # Lazy import — cv2/mediapipe are heavy; only load when video is actually needed
    # video_analysis/ now lives inside ml/ alongside this file
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from video_analysis.boxing_analytics.pipeline import run_pipeline

    s3 = boto3.client("s3", region_name=region)

    with tempfile.TemporaryDirectory() as tmp_dir:
        # Download original video
        video_path = os.path.join(tmp_dir, "input.mov")
        with open(video_path, "wb") as f:
            s3.download_fileobj(bucket, mov_key, f)

        # Download IMU CSV for sync
        csv_path = os.path.join(tmp_dir, "imu.csv")
        with open(csv_path, "wb") as f:
            s3.download_fileobj(bucket, csv_key, f)

        out_dir = os.path.join(tmp_dir, "output")
        os.makedirs(out_dir, exist_ok=True)

        # Redirect stdout to stderr so pipeline progress logs don't pollute the JSON output
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

                # Upload annotated video back to S3
        annotated_path = os.path.join(out_dir, "input_annotated.mp4")

        if not os.path.exists(annotated_path):
            raise FileNotFoundError(f"Annotated video not found: {annotated_path}")

        # Convert OpenCV MP4 to browser-compatible H.264 MP4
        browser_video_path = os.path.join(out_dir, "annotated_video_browser.mp4")

        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    annotated_path,
                    "-vcodec",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-an",
                    browser_video_path,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )

            upload_path = browser_video_path
            print(
                "[VideoModel] Converted annotated video to browser-compatible H.264 MP4",
                file=sys.stderr,
            )

        except Exception as error:
            print(
                f"[VideoModel] ffmpeg conversion failed, uploading original video: {error}",
                file=sys.stderr,
            )
            upload_path = annotated_path

        output_key = f"outputs/{session_id}/annotated_video.mp4"

        with open(upload_path, "rb") as f:
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
