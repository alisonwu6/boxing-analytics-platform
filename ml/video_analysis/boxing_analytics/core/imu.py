"""IMU data loading and preprocessing."""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import openpyxl

from .utils import gaussian_smooth


@dataclass
class IMUData:
    label:            str
    sensor_id:        int
    timestamps:       np.ndarray
    acc_x:            np.ndarray
    acc_y:            np.ndarray
    acc_z:            np.ndarray
    gyro_x:           np.ndarray
    gyro_y:           np.ndarray
    gyro_z:           np.ndarray
    lin_acc_y:        np.ndarray
    magnitude:        np.ndarray   # smoothed |AccXYZ|
    dropout_mask:     np.ndarray   # True = suspect sample
    lin_acc_x:        np.ndarray = None   # linear accel X (gravity removed)
    lin_acc_z:        np.ndarray = None   # linear accel Z (gravity removed)
    lin_acc_magnitude: np.ndarray = None  # smoothed |LinAccXYZ| — for punch detection
    fs:               float = 200.0


class IMUProcessor:
    """
    Loads IMU data from .xlsx or .csv.

    Expected columns (auto-detected by header name or by position):
      TimeStamp(s), AccX(g), AccY(g), AccZ(g),
      GyroX, GyroY, GyroZ, [LinAccX, LinAccY, LinAccZ]
    """

    def load(self, path: str, label: str) -> IMUData:
        path = str(path)
        ext  = Path(path).suffix.lower()
        print(f"[IMUProcessor] Loading {label} ← {Path(path).name} …")

        if ext in (".xlsx", ".xlsm", ".xls"):
            data, headers = self._load_excel(path)
        elif ext in (".csv", ".tsv"):
            data, headers = self._load_csv(path)
        else:
            raise ValueError(f"Unsupported file type: {ext}  (xlsx / csv only)")

        col = self._map_columns(headers)
        ts  = data[:, col["time"]]
        ax  = data[:, col["ax"]]
        ay  = data[:, col["ay"]]
        az  = data[:, col["az"]]
        gx  = data[:, col["gx"]]  if "gx"  in col else np.zeros_like(ts)
        gy  = data[:, col["gy"]]  if "gy"  in col else np.zeros_like(ts)
        gz  = data[:, col["gz"]]  if "gz"  in col else np.zeros_like(ts)
        lay = data[:, col["lay"]] if "lay" in col else np.zeros_like(ts)
        lax = data[:, col["lax"]] if "lax" in col else np.zeros_like(ts)
        laz = data[:, col["laz"]] if "laz" in col else np.zeros_like(ts)

        mag     = gaussian_smooth(np.sqrt(ax**2  + ay**2  + az**2),  sigma=3)
        lin_mag = gaussian_smooth(np.sqrt(lax**2 + lay**2 + laz**2), sigma=2)

        # Dropout detection: frozen values OR extreme spikes
        win  = int(0.5 * 200)
        drop = (mag > 4.0) | np.isnan(mag)
        for i in range(win, len(mag) - win):
            if np.std(ay[i - win:i + win]) < 0.002:
                drop[i - win:i + win] = True

        sid = int(data[0, 0]) if data.shape[1] > 1 and not np.isnan(data[0, 0]) else -1
        print(f"  → {len(data)} samples  t=[{ts[0]:.2f}–{ts[-1]:.2f}s]  "
              f"SensorId={sid}  dropouts={drop.sum()/len(drop)*100:.1f}%")

        has_lin = "lax" in col or "laz" in col or "lay" in col
        if has_lin:
            print(f"  → Linear accel loaded (X/Y/Z)")

        return IMUData(
            label=label, sensor_id=sid,
            timestamps=ts, acc_x=ax, acc_y=ay, acc_z=az,
            gyro_x=gx, gyro_y=gy, gyro_z=gz,
            lin_acc_y=lay, lin_acc_x=lax, lin_acc_z=laz,
            magnitude=mag, lin_acc_magnitude=lin_mag,
            dropout_mask=drop,
        )

    def _load_excel(self, path: str):
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        if ws is not None:
            rows = list(ws.iter_rows(values_only=True))
            wb.close()
        else:
            wb.close()
            rows = self._load_excel_strict_xml(path)

        headers = [str(h).strip() if h else f"col{i}"
                   for i, h in enumerate(rows[0])]
        data = np.array(
            [[v if v is not None else np.nan for v in r] for r in rows[1:]],
            dtype=float,
        )
        return data, headers

    def _load_excel_strict_xml(self, path: str):
        """Parse strict OOXML .xlsx files via zipfile + ElementTree."""
        import zipfile
        import xml.etree.ElementTree as ET

        NS_STRICT = "http://purl.oclc.org/ooxml/spreadsheetml/main"
        NS_TRANS  = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()

            # Load shared strings table
            shared = []
            ss_candidates = [n for n in names if "sharedStrings" in n]
            if ss_candidates:
                tree = ET.fromstring(zf.read(ss_candidates[0]))
                ns = NS_STRICT if NS_STRICT in tree.tag else NS_TRANS
                for si in tree.findall(f"{{{ns}}}si"):
                    t = si.find(f"{{{ns}}}t")
                    if t is not None:
                        shared.append(t.text or "")
                    else:
                        # rich text — join all <t> elements
                        parts = [e.text or "" for e in si.iter(f"{{{ns}}}t")]
                        shared.append("".join(parts))

            # Find first worksheet
            sheet_candidates = sorted(
                [n for n in names if n.startswith("xl/worksheets/sheet")
                 and n.endswith(".xml")]
            )
            if not sheet_candidates:
                raise ValueError(f"No worksheets found in {path}")

            tree = ET.fromstring(zf.read(sheet_candidates[0]))
            ns = NS_STRICT if NS_STRICT in tree.tag else NS_TRANS
            sd = f"{{{ns}}}"

            rows = []
            for row_el in tree.iter(f"{sd}row"):
                row = []
                for c in row_el:
                    t_attr = c.get("t", "n")   # cell type
                    v_el   = c.find(f"{sd}v")
                    val    = None
                    if v_el is not None and v_el.text is not None:
                        if t_attr == "s":
                            idx = int(v_el.text)
                            val = shared[idx] if idx < len(shared) else ""
                        elif t_attr in ("str", "inlineStr", "b"):
                            val = v_el.text
                        else:
                            try:
                                val = float(v_el.text)
                            except ValueError:
                                val = v_el.text
                    row.append(val)
                if row:
                    rows.append(tuple(row))

        print(f"  [IMUProcessor] strict-OOXML fallback: {len(rows)} rows read")
        return rows

    def _load_csv(self, path: str):
        with open(path) as f:
            first = f.readline()
        sep = "," if "," in first else "\t"
        headers = [h.strip() for h in first.strip().split(sep)]
        data = np.genfromtxt(path, delimiter=sep, skip_header=1)
        return data, headers

    def _map_columns(self, headers: List[str]) -> Dict[str, int]:
        """Map known column names → indices. Falls back to positional."""
        h = [x.lower() for x in headers]

        def find(*keys):
            for k in keys:
                for i, name in enumerate(h):
                    if k in name:
                        return i
            return None

        col = {}
        col["time"] = find("timestamp", "time", "t(s)", "t_s") or 1
        col["ax"]   = find("accx", "acc_x", "ax")  or 3
        col["ay"]   = find("accy", "acc_y", "ay")  or 4
        col["az"]   = find("accz", "acc_z", "az")  or 5
        for k, keys in [("gx",  ["gyrox","gyro_x","gx"]),
                        ("gy",  ["gyroy","gyro_y","gy"]),
                        ("gz",  ["gyroz","gyro_z","gz"]),
                        ("lax", ["linacc_x","linaccx","lin_acc_x","linearaccx"]),
                        ("lay", ["linacc_y","linaccy","lin_acc_y","linearaccy"]),
                        ("laz", ["linacc_z","linaccz","lin_acc_z","linearaccz"])]:
            v = find(*keys)
            if v is not None:
                col[k] = v
        return col
