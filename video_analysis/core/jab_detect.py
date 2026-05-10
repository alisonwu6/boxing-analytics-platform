import numpy as np
from core.signals import gauss_smooth
from core.landmarks import DRAW_JOINTS

_LW, _LE, _LS = 9, 7, 5
_RW, _RE, _RS = 10, 8, 6

EA_LOAD_MAX  = 120.0
EA_DRIVE_MIN = 100.0
MIN_EXTEND   = 10.0
MIN_SPEED    = 500.0
MAX_SPEED    = 5000.0


def _find_extension_peaks(sp, dsw_dot):
    peaks = []; n = len(dsw_dot); i = 0
    while i < n:
        if dsw_dot[i] > 0:
            seg_start = i
            while i < n and dsw_dot[i] > 0:
                i += 1
            seg_sp = sp[seg_start:i]
            valid  = seg_sp <= MAX_SPEED
            if valid.any():
                best = int(np.argmax(np.where(valid, seg_sp, -1.0))) + seg_start
                peaks.append(best)
        else:
            i += 1
    return peaks


def validate_jab_pattern(pk, sp, dsw, dsw_dot, ea, fps):
    lookback  = int(0.50 * fps)
    lookahead = int(0.50 * fps)

    ea_win = ea[max(0, pk - lookback): pk]
    if len(ea_win) == 0: return None, "no_lookback"
    ea_min_val = float(np.min(ea_win))
    if ea_min_val >= EA_LOAD_MAX:
        return None, f"ea_min={ea_min_val:.0f}>={EA_LOAD_MAX:.0f}"

    start_fi = max(0, pk - lookback)
    for i in range(pk - 1, max(0, pk - lookback), -1):
        if float(dsw_dot[i]) <= 0:
            start_fi = i
            break
    dsw_gain = float(dsw[pk]) - float(dsw[start_fi])
    if np.isnan(dsw_gain):
        return None, "gain=nan"
    if dsw_gain < MIN_EXTEND:
        return None, f"gain={dsw_gain:.0f}<{MIN_EXTEND:.0f}"

    peak_sp = float(sp[pk])
    if peak_sp < MIN_SPEED:
        return None, f"speed={peak_sp:.0f}<{MIN_SPEED:.0f}"
    if peak_sp > MAX_SPEED:
        return None, f"speed={peak_sp:.0f}>{MAX_SPEED:.0f}"

    end_fi = min(len(dsw_dot) - 1, pk + lookahead)
    for i in range(pk + 1, min(len(dsw_dot), pk + lookahead)):
        if float(dsw_dot[i]) <= 0:
            end_fi = i
            break

    ea_drive_win = ea[start_fi : min(len(ea), end_fi + 1)]
    ea_max_drive = float(np.max(ea_drive_win)) if len(ea_drive_win) > 0 else 0.0
    if ea_max_drive < EA_DRIVE_MIN:
        return None, f"ea_max={ea_max_drive:.0f}<{EA_DRIVE_MIN:.0f}"

    return {
        "start_fi":     start_fi,
        "peak_fi":      pk,
        "end_fi":       end_fi,
        "ea_min":       round(ea_min_val, 1),
        "ea_peak":      round(float(ea[pk]), 1),
        "ea_max_drive": round(ea_max_drive, 1),
        "dsw_start":    round(float(dsw[start_fi]), 1),
        "dsw_peak":     round(float(dsw[pk]), 1),
        "dsw_gain":     round(dsw_gain, 1),
        "peak_speed":   round(float(sp[pk]), 1),
        "dur_s":        round((end_fi - start_fi) / fps, 3),
    }, None


def detect_jabs(sp_L, dsw_L, dsw_dot_L, ea_L,
                sp_R, dsw_R, dsw_dot_R, ea_R, fps):
    print("\nDetecting jab patterns…")
    punches        = []
    rejected_peaks = []

    for hand, sp, dsw, dsw_dot, ea in [
        ("L", sp_L, dsw_L, dsw_dot_L, ea_L),
        ("R", sp_R, dsw_R, dsw_dot_R, ea_R),
    ]:
        ea_guard  = gauss_smooth(ea, 1.5)
        peaks     = _find_extension_peaks(sp, dsw_dot)
        count     = 0
        cycle_end = -1

        for pk in peaks:
            if pk <= cycle_end:
                rejected_peaks.append({
                    "hand": hand, "peak_fi": pk,
                    "peak_t": round(pk / fps, 3), "reason": "in_cycle",
                    "sp": round(float(sp[pk]), 1),
                    "dsw": round(float(dsw[pk]) if not np.isnan(dsw[pk]) else 0.0, 1),
                    "ea": round(float(ea_guard[pk]), 1),
                })
                continue

            result, reason = validate_jab_pattern(pk, sp, dsw, dsw_dot, ea_guard, fps)

            if result is None:
                rejected_peaks.append({
                    "hand": hand, "peak_fi": pk,
                    "peak_t": round(pk / fps, 3), "reason": reason,
                    "sp": round(float(sp[pk]), 1),
                    "dsw": round(float(dsw[pk]) if not np.isnan(dsw[pk]) else 0.0, 1),
                    "ea": round(float(ea_guard[pk]), 1),
                })
            else:
                if result["start_fi"] <= cycle_end:
                    rejected_peaks.append({
                        "hand": hand, "peak_fi": pk,
                        "peak_t": round(pk / fps, 3), "reason": "overlaps_prev",
                        "sp": round(float(sp[pk]), 1),
                        "dsw": round(float(dsw[pk]) if not np.isnan(dsw[pk]) else 0.0, 1),
                        "ea": round(float(ea_guard[pk]), 1),
                    })
                    continue
                cycle_end   = result["end_fi"]
                count      += 1
                result["hand"]  = hand
                result["punch"] = count
                punches.append(result)
                print(f"  [{hand}] #{count}  peak@{pk/fps:.2f}s  "
                      f"start={result['start_fi']/fps:.2f}s  end={result['end_fi']/fps:.2f}s  "
                      f"ea_min={result['ea_min']:.0f}°  ea_peak={result['ea_peak']:.0f}°  "
                      f"ea_max={result['ea_max_drive']:.0f}°  gain={result['dsw_gain']:.0f}px  "
                      f"spd={result['peak_speed']:.0f}px/s")

        print(f"  [{hand}] {count} jabs confirmed out of {len(peaks)} peaks")

    return punches, rejected_peaks


def apply_shoulder_zone_filter(raw_jx, raw_jy, punches, margin=60):
    xs, ys = [], []
    for p in punches:
        for fi in range(p["start_fi"], p["end_fi"] + 1):
            lsx = raw_jx[_LS][fi]; rsx = raw_jx[_RS][fi]
            lsy = raw_jy[_LS][fi]; rsy = raw_jy[_RS][fi]
            if not (np.isnan(lsx) or np.isnan(rsx)):
                xs.append((lsx + rsx) / 2)
                ys.append((lsy + rsy) / 2)

    if len(xs) < 10:
        print("  Shoulder zone filter: too few punch frames, skipping")
        return raw_jx, raw_jy

    lo_x = float(np.percentile(xs, 5))  - margin
    hi_x = float(np.percentile(xs, 95)) + margin
    lo_y = float(np.percentile(ys, 5))  - margin
    hi_y = float(np.percentile(ys, 95)) + margin

    n = len(raw_jx[_LS]); rejected = 0
    for fi in range(n):
        lsx = raw_jx[_LS][fi]; rsx = raw_jx[_RS][fi]
        lsy = raw_jy[_LS][fi]; rsy = raw_jy[_RS][fi]
        if np.isnan(lsx) or np.isnan(rsx): continue
        mx = (lsx + rsx) / 2; my = (lsy + rsy) / 2
        if not (lo_x <= mx <= hi_x and lo_y <= my <= hi_y):
            for j in DRAW_JOINTS:
                raw_jx[j][fi] = np.nan
                raw_jy[j][fi] = np.nan
            rejected += 1

    print(f"  Shoulder zone:  x=[{lo_x:.0f}, {hi_x:.0f}]  y=[{lo_y:.0f}, {hi_y:.0f}]"
          f"  (margin={margin}px)  blanked {rejected}/{n} frames ({100*rejected/n:.1f}%)")
    return raw_jx, raw_jy
