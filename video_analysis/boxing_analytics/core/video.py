"""Video processing: pose backends and per-frame kinematics extraction."""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from .utils import gaussian_smooth, finite_diff


@dataclass
class VideoKinematics:
    timestamps:      np.ndarray   # seconds, shape (N,)
    centroid_y:      np.ndarray   # norm [0,1]; 0 = top of frame
    centroid_x:      np.ndarray
    bbox_top:        np.ndarray   # top edge of fg bounding box (norm)
    bbox_h:          np.ndarray   # bounding-box height (pixels)
    bbox_raw:        list         # list of (x,y,w,h) per frame — for skeleton
    flow_vert:       np.ndarray   # mean foreground vertical optical flow (px/frame)
    jump_signal:     np.ndarray   # fused jump signal (pos = upward motion)
    vel_y:           np.ndarray   # centroid vertical velocity
    acc_y:           np.ndarray   # centroid vertical acceleration
    fps:             float
    frame_h:         int
    frame_w:         int
    lm_left_wrist_y:  Optional[np.ndarray] = None
    lm_right_wrist_y: Optional[np.ndarray] = None
    lm_nose_y:        Optional[np.ndarray] = None
    lm_hip_y:         Optional[np.ndarray] = None
    pose_confidence:  Optional[np.ndarray] = None


class MediaPipeBackend:
    """MediaPipe Pose Landmarker backend (Tasks API — mediapipe >= 0.10)."""
    name = "mediapipe"

    _NOSE        = 0
    _LEFT_WRIST  = 15
    _RIGHT_WRIST = 16
    _LEFT_HIP    = 23
    _RIGHT_HIP   = 24

    _MODEL_URL  = (
        "https://storage.googleapis.com/mediapipe-models/"
        "pose_landmarker/pose_landmarker_full/float16/latest/"
        "pose_landmarker_full.task"
    )
    _MODEL_FILE = "pose_landmarker_full.task"

    def __init__(self, fps: float = 30.0):
        import mediapipe as mp                          # type: ignore
        from mediapipe.tasks import python as mp_tasks  # type: ignore
        from mediapipe.tasks.python import vision       # type: ignore

        model_path = Path(self._MODEL_FILE)
        if not model_path.exists():
            self._download_model(model_path)

        base_opts = mp_tasks.BaseOptions(model_asset_path=str(model_path))
        options   = vision.PoseLandmarkerOptions(
            base_options=base_opts,
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        self._mp   = mp
        self._fps  = fps
        self._fidx = 0

    def _download_model(self, path: Path):
        import urllib.request
        print(f"[MediaPipe] Downloading pose model → {path}  (one-time, ~29 MB) …")
        urllib.request.urlretrieve(self._MODEL_URL, str(path))
        print("[MediaPipe] Model download complete.")

    def process_frame(self, frame_bgr: np.ndarray) -> Dict:
        rgb      = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(
            image_format=self._mp.ImageFormat.SRGB, data=rgb
        )
        ts_ms = int(self._fidx * 1000 / self._fps)
        self._fidx += 1

        result = self._landmarker.detect_for_video(mp_image, ts_ms)
        if not result.pose_landmarks:
            return {}

        lm = result.pose_landmarks[0]

        def y(i):   return float(lm[i].y)
        def vis(i): return float(getattr(lm[i], "visibility", 1.0))

        return dict(
            nose_y        = y(self._NOSE),
            left_wrist_y  = y(self._LEFT_WRIST),
            right_wrist_y = y(self._RIGHT_WRIST),
            left_hip_y    = y(self._LEFT_HIP),
            right_hip_y   = y(self._RIGHT_HIP),
            confidence    = float(np.mean([vis(self._LEFT_HIP), vis(self._RIGHT_HIP)])),
            landmarks     = lm,
        )

    def close(self):
        self._landmarker.close()


class OpenCVBackend:
    """Background subtraction + dense optical flow fallback."""
    name = "opencv"

    def __init__(self, h: int, w: int):
        self._bg     = cv2.createBackgroundSubtractorMOG2(
            history=80, varThreshold=20, detectShadows=False
        )
        self._kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        self._prev   = None
        self._h, self._w = h, w

    def process_frame(self, frame_bgr: np.ndarray) -> Dict:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        fg = self._bg.apply(frame_bgr)
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,   self._kernel)
        fg = cv2.morphologyEx(fg, cv2.MORPH_DILATE, self._kernel, iterations=2)

        flow_y = 0.0
        if self._prev is not None:
            flow = cv2.calcOpticalFlowFarneback(
                self._prev, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
            )
            fg_pts = fg > 0
            if fg_pts.sum() > 100:
                flow_y = float(flow[fg_pts, 1].mean())

        self._prev = gray

        cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        bbox = (0, 0, 0, 0)
        pts  = np.argwhere(fg > 0)
        cy, cx, bbox_top = 0.5, 0.5, 0.5
        if cnts:
            largest = max(cnts, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(largest)
            bbox = (x, y, w, h)
        if len(pts) > 50:
            cy       = float(pts[:, 0].mean()) / self._h
            cx       = float(pts[:, 1].mean()) / self._w
            bbox_top = float(pts[:, 0].min())  / self._h

        return dict(
            centroid_y = cy,
            centroid_x = cx,
            bbox_top   = bbox_top,
            bbox_h     = float(bbox[3]),
            bbox_raw   = bbox,
            flow_y     = flow_y,
        )

    def close(self): pass


class VideoProcessor:
    """Frame-by-frame video analysis → VideoKinematics."""

    SMOOTH_SIGMA = 8

    def __init__(self, video_path: str, pose_backend: str = "auto",
                 stop_at_s: Optional[float] = None):
        self.path          = str(video_path)
        self._backend      = None
        self._pose_backend = pose_backend
        self._stop_at_s    = stop_at_s

    def _select_backend(self, h, w, fps: float = 30.0):
        choice = self._pose_backend.lower()
        if choice == "mediapipe":
            return MediaPipeBackend(fps=fps)
        if choice == "opencv":
            return OpenCVBackend(h, w)
        try:
            return MediaPipeBackend(fps=fps)
        except (ImportError, Exception):
            return OpenCVBackend(h, w)

    def process(self) -> VideoKinematics:
        cap = cv2.VideoCapture(self.path)
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open: {self.path}")

        fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        H     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        W     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        print(f"[VideoProcessor] {Path(self.path).name}: "
              f"{total} frames @ {fps:.1f} fps  {H}×{W}")

        self._backend = self._select_backend(H, W, fps)

        ts_l, cy_l, cx_l, bt_l, bh_l = [], [], [], [], []
        bbox_raw_l, fy_l               = [], []
        lm_lwy, lm_rwy, lm_ny, lm_hy, lm_conf = [], [], [], [], []
        has_lm = False

        max_frames = (int(self._stop_at_s * fps) if self._stop_at_s is not None
                      else total)
        if self._stop_at_s is not None:
            print(f"[VideoProcessor] Processing first {self._stop_at_s:.1f}s "
                  f"({max_frames} frames)")

        fidx = 0
        while True:
            if fidx >= max_frames:
                break
            ok, frame = cap.read()
            if not ok:
                break
            r = self._backend.process_frame(frame)
            ts_l.append(fidx / fps)
            cy_l.append(r.get("centroid_y", 0.5))
            cx_l.append(r.get("centroid_x", 0.5))
            bt_l.append(r.get("bbox_top",   0.5))
            bh_l.append(r.get("bbox_h",     0.0))
            bbox_raw_l.append(r.get("bbox_raw", (0, 0, 0, 0)))
            fy_l.append(r.get("flow_y",     0.0))

            if "nose_y" in r:
                has_lm = True
            lm_lwy.append(r.get("left_wrist_y",  np.nan))
            lm_rwy.append(r.get("right_wrist_y", np.nan))
            lm_ny.append(r.get("nose_y",          np.nan))
            lm_hy.append(0.5 * (r.get("left_hip_y",  np.nan) +
                                 r.get("right_hip_y", np.nan)))
            lm_conf.append(r.get("confidence", 0.0))

            fidx += 1
            if fidx % 150 == 0:
                print(f"  frame {fidx}/{total}  t={fidx/fps:.1f}s")

        cap.release()
        self._backend.close()
        print(f"[VideoProcessor] Done — {fidx} frames processed.")

        t  = np.array(ts_l)
        dt = 1.0 / fps

        if has_lm:
            hip_raw = np.array(lm_hy, dtype=float)
            nans = np.isnan(hip_raw)
            if not nans.all():
                ok_idx = np.where(~nans)[0]
                hip_raw = np.interp(np.arange(len(hip_raw)), ok_idx, hip_raw[ok_idx])
            cy = gaussian_smooth(hip_raw, self.SMOOTH_SIGMA)

            nose_raw = np.array(lm_ny, dtype=float)
            if not np.isnan(nose_raw).all():
                ok_idx = np.where(~np.isnan(nose_raw))[0]
                nose_raw = np.interp(np.arange(len(nose_raw)), ok_idx, nose_raw[ok_idx])
            bt = gaussian_smooth(nose_raw, self.SMOOTH_SIGMA)

            hip_vel     = gaussian_smooth(finite_diff(cy, dt), self.SMOOTH_SIGMA)
            jump_signal = gaussian_smooth(-hip_vel * fps, self.SMOOTH_SIGMA)
            fy          = np.zeros_like(cy)
        else:
            fy      = gaussian_smooth(np.array(fy_l), self.SMOOTH_SIGMA)
            bt      = gaussian_smooth(np.array(bt_l), self.SMOOTH_SIGMA)
            bt_vel  = gaussian_smooth(finite_diff(bt, dt), self.SMOOTH_SIGMA)
            jump_signal = gaussian_smooth(-fy - bt_vel * fps * 0.5, self.SMOOTH_SIGMA)
            cy      = gaussian_smooth(np.array(cy_l), self.SMOOTH_SIGMA)

        cx    = np.array(cx_l)
        bh    = np.array(bh_l)
        vel_y = gaussian_smooth(finite_diff(cy, dt), self.SMOOTH_SIGMA // 2)
        acc_y = gaussian_smooth(finite_diff(cy, dt, 2), self.SMOOTH_SIGMA // 2)

        return VideoKinematics(
            timestamps       = t,
            centroid_y       = cy,
            centroid_x       = cx,
            bbox_top         = bt,
            bbox_h           = bh,
            bbox_raw         = bbox_raw_l,
            flow_vert        = fy,
            jump_signal      = jump_signal,
            vel_y            = vel_y,
            acc_y            = acc_y,
            fps              = fps,
            frame_h          = H,
            frame_w          = W,
            lm_left_wrist_y  = np.array(lm_lwy) if has_lm else None,
            lm_right_wrist_y = np.array(lm_rwy) if has_lm else None,
            lm_nose_y        = np.array(lm_ny)  if has_lm else None,
            lm_hip_y         = np.array(lm_hy)  if has_lm else None,
            pose_confidence  = np.array(lm_conf) if has_lm else None,
        )