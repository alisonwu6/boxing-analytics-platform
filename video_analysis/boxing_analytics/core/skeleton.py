"""Skeleton drawing: anatomical stick-figure from bounding box or MediaPipe landmarks."""

from typing import Dict, Optional, Tuple

import cv2
import numpy as np


class SkeletonDrawer:
    """Draws a stick-figure skeleton from a bounding box or MediaPipe landmarks."""

    CONNECTIONS = [
        ("head",  "neck"),
        ("neck",  "l_shoulder"), ("neck",  "r_shoulder"),
        ("neck",  "l_hip"),      ("neck",  "r_hip"),       # torso lines
        ("l_hip", "r_hip"),
        ("l_shoulder", "l_elbow"), ("l_elbow", "l_wrist"),
        ("r_shoulder", "r_elbow"), ("r_elbow", "r_wrist"),
        ("l_hip",  "l_knee"),  ("l_knee",  "l_ankle"),
        ("r_hip",  "r_knee"),  ("r_knee",  "r_ankle"),
    ]

    JOINT_RATIOS = {
        # (y_frac, x_frac) relative to bbox top-left, scaled by (h, w)
        "head":       (0.08,  0.50),
        "neck":       (0.18,  0.50),
        "l_shoulder": (0.25,  0.25),
        "r_shoulder": (0.25,  0.75),
        "l_elbow":    (0.42,  0.12),
        "r_elbow":    (0.42,  0.88),
        "l_wrist":    (0.58,  0.06),
        "r_wrist":    (0.58,  0.94),
        "l_hip":      (0.58,  0.32),
        "r_hip":      (0.58,  0.68),
        "l_knee":     (0.77,  0.32),
        "r_knee":     (0.77,  0.68),
        "l_ankle":    (0.95,  0.32),
        "r_ankle":    (0.95,  0.68),
    }

    def __init__(
        self,
        bone_color:  Tuple = (0, 220, 120),
        joint_color: Tuple = (0, 255, 200),
        wrist_color: Tuple = (0, 100, 255),
        thickness:   int   = 2,
    ):
        self.bone_color  = bone_color
        self.joint_color = joint_color
        self.wrist_color = wrist_color
        self.thickness   = thickness

    def _bbox_to_joints(self, bbox: Tuple) -> Dict[str, Tuple[int, int]]:
        bx, by, bw, bh = bbox
        if bw < 5 or bh < 5:
            return {}
        joints = {}
        for name, (yf, xf) in self.JOINT_RATIOS.items():
            px = int(bx + xf * bw)
            py = int(by + yf * bh)
            joints[name] = (px, py)
        return joints

    def draw(self, frame: np.ndarray, bbox: Tuple,
             mp_landmarks=None) -> np.ndarray:
        """Draw skeleton on frame in-place. Returns frame."""
        if mp_landmarks is not None:
            return self._draw_mediapipe(frame, mp_landmarks)
        return self._draw_bbox_skeleton(frame, bbox)

    def _draw_bbox_skeleton(self, frame: np.ndarray, bbox: Tuple) -> np.ndarray:
        joints = self._bbox_to_joints(bbox)
        if not joints:
            return frame

        # Bones
        for a, b in self.CONNECTIONS:
            if a in joints and b in joints:
                cv2.line(frame, joints[a], joints[b],
                         self.bone_color, self.thickness, cv2.LINE_AA)

        # Joints
        for name, pt in joints.items():
            color = self.wrist_color if "wrist" in name else self.joint_color
            r = 5 if "wrist" in name or "ankle" in name else 4
            cv2.circle(frame, pt, r, color, -1, cv2.LINE_AA)
            cv2.circle(frame, pt, r + 1, (0, 0, 0), 1, cv2.LINE_AA)

        # Bounding box
        bx, by, bw, bh = bbox
        cv2.rectangle(frame, (bx, by), (bx + bw, by + bh),
                      (0, 200, 80), 1, cv2.LINE_AA)
        return frame

    # BlazePose 33-landmark connections
    _MP_CONNECTIONS = [
        (0,1),(1,2),(2,3),(3,7),          # face left
        (0,4),(4,5),(5,6),(6,8),          # face right
        (9,10),                            # mouth
        (11,12),                           # shoulders
        (11,13),(13,15),(15,17),(15,19),(15,21),(17,19),  # left arm/hand
        (12,14),(14,16),(16,18),(16,20),(16,22),(18,20),  # right arm/hand
        (11,23),(12,24),(23,24),           # torso
        (23,25),(25,27),(27,29),(27,31),(29,31),  # left leg/foot
        (24,26),(26,28),(28,30),(28,32),(30,32),  # right leg/foot
    ]

    def _draw_mediapipe(self, frame: np.ndarray, landmarks) -> np.ndarray:
        H, W = frame.shape[:2]

        def pt(i):
            lm = landmarks[i]
            return int(lm.x * W), int(lm.y * H)

        for a, b in self._MP_CONNECTIONS:
            if a < len(landmarks) and b < len(landmarks):
                cv2.line(frame, pt(a), pt(b),
                         self.bone_color, self.thickness, cv2.LINE_AA)

        for i, lm in enumerate(landmarks):
            px, py = int(lm.x * W), int(lm.y * H)
            is_wrist = i in (15, 16)
            color = self.wrist_color if is_wrist else self.joint_color
            r     = 5 if is_wrist else 3
            cv2.circle(frame, (px, py), r,     color,   -1, cv2.LINE_AA)
            cv2.circle(frame, (px, py), r + 1, (0,0,0),  1, cv2.LINE_AA)

        return frame
