"""Boxing analytics core modules."""
from .utils import gaussian_smooth, finite_diff, find_peaks_simple, cross_correlate_offset
from .video import VideoKinematics, VideoProcessor, MediaPipeBackend, OpenCVBackend
from .skeleton import SkeletonDrawer
from .imu import IMUData, IMUProcessor
from .sync import JumpEvent, SyncResult, Synchronizer, FusedDataset, DataFusion
from .wrist import PunchEvent, WristPunchDetector

__all__ = [
    "gaussian_smooth", "finite_diff", "find_peaks_simple", "cross_correlate_offset",
    "VideoKinematics", "VideoProcessor", "MediaPipeBackend", "OpenCVBackend",
    "SkeletonDrawer",
    "IMUData", "IMUProcessor",
    "JumpEvent", "SyncResult", "Synchronizer", "FusedDataset", "DataFusion",
    "PunchEvent", "WristPunchDetector",
]
