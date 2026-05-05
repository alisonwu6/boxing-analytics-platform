import csv
from pathlib import Path

import numpy as np

JOINT_NAMES = {
    5: "L_shoulder",  6: "R_shoulder",
    7: "L_elbow",     8: "R_elbow",
    9: "L_wrist",     10: "R_wrist",
    11: "L_hip",      12: "R_hip",
    13: "L_knee",     14: "R_knee",
    15: "L_ankle",    16: "R_ankle",
}


def save_tracking_csv(out_stem, fps, n_frames,
                      smooth_jx, smooth_jy,
                      L_dsw, R_dsw, L_sp, R_sp, L_ea, R_ea,
                      punches):
    csv_path = str(Path(out_stem).with_suffix(".tracking.csv"))

    L_punch_id = np.zeros(n_frames, dtype=int)
    R_punch_id = np.zeros(n_frames, dtype=int)
    for p in punches:
        arr = L_punch_id if p["hand"] == "L" else R_punch_id
        arr[p["start_fi"] : p["end_fi"] + 1] = p["punch"]

    header = ["frame", "t_s"]
    for j in sorted(JOINT_NAMES):
        n = JOINT_NAMES[j]
        header += [f"{n}_x", f"{n}_y"]
    header += ["L_speed_px_s", "R_speed_px_s",
               "L_dsw_px", "R_dsw_px",
               "L_ea_deg", "R_ea_deg",
               "L_punch_id", "R_punch_id"]

    def _f(v, dec=1):
        return "" if (isinstance(v, float) and np.isnan(v)) else round(float(v), dec)

    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for fi in range(n_frames):
            row = [fi, round(fi / fps, 4)]
            for j in sorted(JOINT_NAMES):
                x = smooth_jx[j][fi]; y = smooth_jy[j][fi]
                row += [_f(x), _f(y)]
            row += [
                _f(L_sp[fi]), _f(R_sp[fi]),
                _f(L_dsw[fi]), _f(R_dsw[fi]),
                _f(L_ea[fi]), _f(R_ea[fi]),
                int(L_punch_id[fi]), int(R_punch_id[fi]),
            ]
            w.writerow(row)

    print(f"Tracking CSV → {csv_path}")
    return csv_path
