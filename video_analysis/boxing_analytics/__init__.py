"""Boxing Analytics — Video + IMU Synchronisation Framework."""
from .core import (
    VideoKinematics, VideoProcessor,
    IMUData, IMUProcessor,
    JumpEvent, SyncResult, Synchronizer, FusedDataset, DataFusion,
    PunchEvent, WristPunchDetector,
)

try:
    from .pipeline import run_pipeline
    from .output import AnnotatedVideoWriter, Visualizer, export_excel
    _FULL_PIPELINE = True
except ImportError:
    _FULL_PIPELINE = False

__version__ = "2.0.0"
__all__ = [
    "VideoKinematics", "VideoProcessor",
    "IMUData", "IMUProcessor",
    "JumpEvent", "SyncResult", "Synchronizer", "FusedDataset", "DataFusion",
    "PunchEvent", "WristPunchDetector",
]
