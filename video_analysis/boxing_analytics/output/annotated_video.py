"""Annotated video writer: skeleton overlay + live IMU chart."""

from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from ..core.imu import IMUData
from ..core.video import VideoKinematics
from ..core.sync import SyncResult
from ..core.skeleton import SkeletonDrawer


class AnnotatedVideoWriter:

    HUD_H   = 30
    CHART_H = 120
    BAR_W   = 220
    BG      = (18, 18, 18)
    CYAN    = (255, 220, 0)
    GREEN   = (0, 220, 80)
    BLUE    = (255, 140, 40)
    ORANGE  = (40, 160, 255)
    RED     = (0, 60, 220)
    WHITE   = (240, 240, 240)
    YELLOW  = (0, 220, 220)

    def __init__(self, video_path: str, out_path: str,
                 kin: VideoKinematics,
                 imu_r: Optional[IMUData],
                 imu_l: Optional[IMUData],
                 sync: SyncResult,
                 backend_name: str = "opencv",
                 t_end: float = 30.0,
                 wrist_df=None):
        self.src_path     = video_path
        self.out_path     = out_path
        self.kin          = kin
        self.imu_r        = imu_r
        self.imu_l        = imu_l
        self.sync         = sync
        self.backend_name = backend_name
        self.t_end        = t_end
        self._wrist_df    = wrist_df
        self._skeleton    = SkeletonDrawer()

    def write(self):
        cap   = cv2.VideoCapture(self.src_path)
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        W     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        H     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        max_frames  = min(total, int(self.t_end * fps))
        canvas_h    = H + self.HUD_H + self.CHART_H
        fourcc      = cv2.VideoWriter_fourcc(*"mp4v")
        out         = cv2.VideoWriter(self.out_path, fourcc, fps, (W, canvas_h))

        print(f"[AnnotatedVideoWriter] {Path(self.src_path).name} → {Path(self.out_path).name}")

        # Build per-frame IMU arrays aligned to video time
        t_vid = self.kin.timestamps
        acc_r = (np.interp(t_vid,
                           self.imu_r.timestamps - self.sync.offset_R,
                           self.imu_r.magnitude, left=0, right=0)
                 if self.imu_r else np.zeros_like(t_vid))
        acc_l = (np.interp(t_vid,
                           self.imu_l.timestamps - self.sync.offset_L,
                           self.imu_l.magnitude, left=0, right=0)
                 if self.imu_l else np.zeros_like(t_vid))

        jump_times = sorted(
            set([j.time_s for j in self.sync.video_jumps]
                + [j.time_s - self.sync.offset_R for j in self.sync.imu_r_jumps]
                + [j.time_s - self.sync.offset_L for j in self.sync.imu_l_jumps])
        )

        vidA_buf: list = []
        rA_buf:   list = []
        lA_buf:   list = []
        WIN_S = 4.0

        fidx = 0
        while fidx < max_frames:
            ok, frame = cap.read()
            if not ok:
                break

            t_now = fidx / fps

            # Skeleton
            bbox = self.kin.bbox_raw[fidx] if fidx < len(self.kin.bbox_raw) else (0, 0, 0, 0)
            frame = self._skeleton.draw(frame, bbox)

            # Canvas
            canvas = np.zeros((canvas_h, W, 3), dtype=np.uint8)
            canvas[self.HUD_H:self.HUD_H + H] = frame

            # HUD bar
            cv2.rectangle(canvas, (0, 0), (W, self.HUD_H), self.BG, -1)
            self._text(canvas, f"t = {t_now:.2f}s   backend: {self.backend_name}",
                       (8, 20), 0.5, self.WHITE)
            self._text(canvas,
                       f"off_R={self.sync.offset_R:+.3f}s  off_L={self.sync.offset_L:+.3f}s",
                       (W // 2, 20), 0.45, self.CYAN)

            # Jump flash
            for jt in jump_times:
                if abs(t_now - jt) < 0.2:
                    cv2.rectangle(canvas, (0, 0), (W, self.HUD_H), (0, 120, 0), -1)
                    self._text(canvas, "JUMP", (W // 2 - 30, 22), 0.7, self.YELLOW, bold=True)

            # Sidebar (current values)
            self._draw_sidebar(canvas, W - self.BAR_W, self.HUD_H,
                               self.BAR_W, H,
                               float(acc_r[fidx]) if fidx < len(acc_r) else 0.0,
                               float(acc_l[fidx]) if fidx < len(acc_l) else 0.0)

            # Rolling chart
            vidA_buf.append(float(self.kin.jump_signal[fidx]) if fidx < len(self.kin.jump_signal) else 0.0)
            rA_buf.append(float(acc_r[fidx]) if fidx < len(acc_r) else 0.0)
            lA_buf.append(float(acc_l[fidx]) if fidx < len(acc_l) else 0.0)
            chart_y = self.HUD_H + H
            self._draw_chart(canvas, 0, chart_y, W, self.CHART_H,
                             vidA_buf, rA_buf, lA_buf,
                             t_now, WIN_S, fps, jump_times)

            out.write(canvas)
            fidx += 1
            if fidx % 300 == 0:
                print(f"  frame {fidx}/{max_frames}  t={t_now:.1f}s")

        cap.release()
        out.release()
        print(f"[AnnotatedVideoWriter] Done — {fidx} frames written.")

    def _text(self, img: np.ndarray, text: str, pos: tuple,
              scale: float, color: tuple, bold: bool = False):
        thickness = 2 if bold else 1
        cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX,
                    scale, color, thickness, cv2.LINE_AA)

    def _draw_sidebar(self, canvas: np.ndarray, x: int, y: int,
                      w: int, h: int, acc_r: float, acc_l: float):
        cv2.rectangle(canvas, (x, y), (x + w, y + h), (10, 10, 10), -1)
        max_g = 6.0
        bar_h = int(h * min(acc_r / max_g, 1.0))
        cv2.rectangle(canvas, (x + 10, y + h - bar_h),
                      (x + w // 2 - 5, y + h), self.BLUE, -1)
        bar_h = int(h * min(acc_l / max_g, 1.0))
        cv2.rectangle(canvas, (x + w // 2 + 5, y + h - bar_h),
                      (x + w - 10, y + h), self.ORANGE, -1)
        self._text(canvas, f"R {acc_r:.1f}g", (x + 10, y + 20), 0.4, self.GREEN)
        self._text(canvas, f"L {acc_l:.1f}g", (x + w // 2 + 5, y + 20), 0.4, self.RED)

    def _draw_chart(self, canvas: np.ndarray, x: int, y: int,
                    w: int, h: int,
                    vidA_buf: list, rA_buf: list, lA_buf: list,
                    t_now: float, win_s: float, fps: float,
                    jump_times: list):
        cv2.rectangle(canvas, (x, y), (x + w, y + h), self.BG, -1)
        cv2.line(canvas, (x, y), (x + w, y), (40, 40, 40), 1)

        win_n = int(win_s * fps)
        n     = len(rA_buf)
        lo    = max(0, n - win_n)
        rslice = rA_buf[lo:]
        lslice = lA_buf[lo:]
        vslice = vidA_buf[lo:]

        if len(rslice) < 2:
            return

        pad   = 8
        ch    = h - 2 * pad
        max_v = max(max(abs(v) for v in rslice + lslice + vslice), 1.0)
        xs    = [x + int(i / max(len(rslice) - 1, 1) * (w - 1)) for i in range(len(rslice))]

        def y_px(v):
            return y + pad + int(ch * (1.0 - np.clip((v + max_v) / (2 * max_v), 0, 1)))

        for sig, color in [(rslice, self.BLUE), (lslice, self.ORANGE), (vslice, self.YELLOW)]:
            pts = [(xs[i], y_px(sig[i])) for i in range(len(sig))]
            for i in range(1, len(pts)):
                cv2.line(canvas, pts[i - 1], pts[i], color, 1, cv2.LINE_AA)

        # Cursor at right edge (current time)
        cx = x + w - 1
        cv2.line(canvas, (cx, y), (cx, y + h), self.WHITE, 1)

        # Jump markers
        for jt in jump_times:
            dt = t_now - jt
            if 0 <= dt <= win_s:
                jx = x + int((1.0 - dt / win_s) * (w - 1))
                cv2.line(canvas, (jx, y), (jx, y + h), self.GREEN, 1)

        self._text(canvas, "IMU-R", (x + 4, y + 14), 0.35, self.BLUE)
        self._text(canvas, "IMU-L", (x + 50, y + 14), 0.35, self.ORANGE)
        self._text(canvas, "video", (x + 96, y + 14), 0.35, self.YELLOW)
