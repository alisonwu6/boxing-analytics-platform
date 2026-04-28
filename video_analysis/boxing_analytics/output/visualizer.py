"""Static multi-panel sync comparison plot."""

from typing import Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from ..core.imu import IMUData
from ..core.video import VideoKinematics
from ..core.sync import SyncResult, FusedDataset


class Visualizer:

    DARK = "#0f0f0f"
    PNL  = "#1a1a1a"
    GRD  = "#2a2a2a"
    C    = {
        "video": "#00e050",
        "imu_r": "#ff8c28",
        "imu_l": "#28a0ff",
        "fused": "#e0e0e0",
        "jump":  "#ffdd00",
        "fill":  "#ffffff",
    }
    JC = ["#ffdd00", "#ff6060", "#60ddff"]

    def _ax(self, ax):
        ax.set_facecolor(self.PNL)
        ax.tick_params(colors="#888888", labelsize=8)
        for spine in ax.spines.values():
            spine.set_color(self.GRD)
        ax.yaxis.label.set_color("#aaaaaa")
        ax.xaxis.label.set_color("#aaaaaa")
        ax.grid(True, color=self.GRD, linewidth=0.5, linestyle="--")
        return ax

    def plot(self, kin: VideoKinematics,
             imu_r: Optional[IMUData],
             imu_l: Optional[IMUData],
             sync: SyncResult,
             fused: FusedDataset,
             out_path: str,
             t_win: Tuple[float, float] = (0.0, 30.0),
             backend_name: str = "opencv"):

        n_rows = 3 + (1 if imu_l else 0)
        fig = plt.figure(figsize=(16, 4 * n_rows), facecolor=self.DARK)
        gs  = fig.add_gridspec(n_rows, 1, hspace=0.45)

        # Panel 1 — Video jump signal
        ax1 = self._ax(fig.add_subplot(gs[0]))
        sig = kin.lm_hip_y if (kin.lm_hip_y is not None
                                and not np.all(np.isnan(kin.lm_hip_y))) \
              else kin.jump_signal
        ax1.plot(kin.timestamps, sig, color=self.C["video"], lw=0.8, label="video signal")
        ax1.set_ylabel("amplitude")
        ax1.set_title(f"Video — {backend_name} backend", color="#cccccc", fontsize=10)
        for i, jv in enumerate(sync.video_jumps):
            c = self.JC[i % len(self.JC)]
            ax1.axvline(jv.time_s, color=c, lw=1.2, ls="--")
            ax1.text(jv.time_s + 0.1, ax1.get_ylim()[1] * 0.85,
                     f"J{i+1}", color=c, fontsize=8)
        ax1.legend(fontsize=8, facecolor=self.PNL, labelcolor="#cccccc")

        # Panel 2 — IMU-R
        row = 1
        if imu_r:
            ax2 = self._ax(fig.add_subplot(gs[row]))
            t_aligned = imu_r.timestamps - sync.offset_R
            ax2.plot(t_aligned, imu_r.magnitude, color=self.C["imu_r"],
                     lw=0.8, label=f"IMU-R  (off={sync.offset_R:+.3f}s)")
            ax2.set_ylabel("|acc| (g)")
            ax2.set_title("IMU Right Wrist", color="#cccccc", fontsize=10)
            for i, jr in enumerate(sync.imu_r_jumps):
                t_vid = jr.time_s - sync.offset_R
                c = self.JC[i % len(self.JC)]
                ax2.axvline(t_vid, color=c, lw=1.2, ls="--")
                ax2.text(t_vid + 0.1, ax2.get_ylim()[1] * 0.85,
                         f"J{i+1}", color=c, fontsize=8)
            ax2.legend(fontsize=8, facecolor=self.PNL, labelcolor="#cccccc")
            row += 1

        # Panel 3 — IMU-L
        if imu_l:
            ax3 = self._ax(fig.add_subplot(gs[row]))
            t_aligned = imu_l.timestamps - sync.offset_L
            ax3.plot(t_aligned, imu_l.magnitude, color=self.C["imu_l"],
                     lw=0.8, label=f"IMU-L  (off={sync.offset_L:+.3f}s)")
            ax3.set_ylabel("|acc| (g)")
            ax3.set_title("IMU Left Wrist", color="#cccccc", fontsize=10)
            for i, jl in enumerate(sync.imu_l_jumps):
                t_vid = jl.time_s - sync.offset_L
                c = self.JC[i % len(self.JC)]
                ax3.axvline(t_vid, color=c, lw=1.2, ls="--")
                ax3.text(t_vid + 0.1, ax3.get_ylim()[1] * 0.85,
                         f"J{i+1}", color=c, fontsize=8)
            ax3.legend(fontsize=8, facecolor=self.PNL, labelcolor="#cccccc")
            row += 1

        # Panel 4 — Fused signal
        ax4 = self._ax(fig.add_subplot(gs[row]))
        ax4.plot(fused.times, fused.acc_y_vid, color=self.C["video"],
                 lw=0.6, alpha=0.6, label="video-derived")
        if imu_r:
            ax4.plot(fused.times, fused.acc_y_R, color=self.C["imu_r"],
                     lw=0.8, label="IMU-R fused")
        if imu_l:
            ax4.plot(fused.times, fused.acc_y_L, color=self.C["imu_l"],
                     lw=0.8, label="IMU-L fused")
        ax4.set_xlabel("time (s, video clock)")
        ax4.set_ylabel("acc_y (g)")
        ax4.set_title(f"Fused 200 Hz signal  [{t_win[0]:.0f}–{t_win[1]:.0f}s]",
                      color="#cccccc", fontsize=10)
        ax4.legend(fontsize=8, facecolor=self.PNL, labelcolor="#cccccc")

        fig.suptitle(
            f"Boxing Analytics — Sync Report  |  "
            f"off_R={sync.offset_R:+.3f}s  off_L={sync.offset_L:+.3f}s  "
            f"inter={sync.inter_sensor:+.3f}s",
            color="#eeeeee", fontsize=11, y=0.995,
        )

        plt.savefig(out_path, dpi=120, bbox_inches="tight",
                    facecolor=self.DARK)
        plt.close(fig)
        print(f"[Visualizer] Saved → {out_path}")
