import numpy as np
from core.signals import gauss_smooth
from core.landmarks import DRAW_JOINTS

_LW, _LE, _LS = 9, 7, 5
_RW, _RE, _RS = 10, 8, 6

EA_LOAD_MAX     = 120.0
EA_DRIVE_MIN    = 70.0
MIN_EXTEND      = 10.0
MIN_EXTEND_3D   = 0.10   # metres - arm must extend at least 10 cm from guard position
MIN_SPEED       = 500.0
MAX_SPEED       = 5000.0
MIN_KIN_SPEED   = 0.5    # m/s - minimum 3D extension rate to count as a jab


def _find_extension_peaks(sp, dsw_dot, dsw_dot_3d=None):
    peaks = []; n = len(dsw_dot); i = 0
    if dsw_dot_3d is not None:
        # 3D path: use kinematic extension rate to find segments and pick peak
        while i < n:
            if dsw_dot_3d[i] > 0:
                seg_start = i
                while i < n and dsw_dot_3d[i] > 0:
                    i += 1
                seg_kin = dsw_dot_3d[seg_start:i]
                best = int(np.argmax(seg_kin)) + seg_start
                peaks.append(best)
            else:
                i += 1
    else:
        # 2D fallback
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


def validate_jab_pattern(pk, sp, dsw, dsw_dot, ea, fps, dsw_3d=None, dsw_dot_3d=None):
    lookback    = int(0.50 * fps)
    lookahead   = int(0.50 * fps)   # used for end_fi / punch duration
    ext_look    = int(0.25 * fps)   # short forward window so we don't bleed into the next punch

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

    # For gain, measure from the guard minimum (lookback) to the arm's maximum extension
    # (forward window). The speed peak often fires before the arm fully extends, so using
    # dsw[speed_peak] underestimates the true extension on fast punches.
    fwd_end = min(len(dsw), pk + ext_look)
    dsw_fwd = dsw[pk:fwd_end]
    dsw_fwd_valid = dsw_fwd[~np.isnan(dsw_fwd)]
    if len(dsw_fwd_valid) == 0:
        return None, "gain=nan"
    dsw_at_ext = float(np.nanmax(dsw_fwd))
    dsw_gain = dsw_at_ext - float(dsw[start_fi])
    if np.isnan(dsw_gain):
        return None, "gain=nan"

    if dsw_3d is not None:
        # 3D: max extension in forward window vs minimum in lookback window
        dsw_3d_fwd = dsw_3d[pk:fwd_end]
        win_back = dsw_3d[max(0, pk - lookback) : pk + 1]
        win_back_valid = win_back[~np.isnan(win_back)]
        win_fwd_valid = dsw_3d_fwd[~np.isnan(dsw_3d_fwd)]
        if len(win_back_valid) == 0 or len(win_fwd_valid) == 0:
            return None, "gain_3d=nan"
        dsw_gain_3d = float(np.max(win_fwd_valid)) - float(np.min(win_back_valid))
        if np.isnan(dsw_gain_3d) or dsw_gain_3d < MIN_EXTEND_3D:
            return None, f"gain_3d={dsw_gain_3d:.3f}<{MIN_EXTEND_3D}"
    else:
        if dsw_gain < MIN_EXTEND:
            return None, f"gain={dsw_gain:.0f}<{MIN_EXTEND:.0f}"
        dsw_gain_3d = None

    peak_sp = float(sp[pk])
    if dsw_dot_3d is not None:
        peak_kin = float(dsw_dot_3d[pk])
        if peak_kin < MIN_KIN_SPEED:
            return None, f"kin_speed={peak_kin:.2f}<{MIN_KIN_SPEED}"
    else:
        if peak_sp < MIN_SPEED:
            return None, f"speed={peak_sp:.0f}<{MIN_SPEED:.0f}"
        if peak_sp > MAX_SPEED:
            return None, f"speed={peak_sp:.0f}>{MAX_SPEED:.0f}"

    # end_fi: first time the arm starts coming back after the peak, used for punch duration
    end_fi = min(len(dsw_dot) - 1, pk + lookahead)
    for i in range(pk + 1, min(len(dsw_dot), pk + lookahead)):
        if float(dsw_dot[i]) <= 0:
            end_fi = i
            break

    # the speed peak often fires when the elbow is still at 70-90 degrees and the arm
    # keeps straightening after, so we need the full lookahead to catch the actual max angle
    ea_fwd_end   = min(len(ea), pk + lookahead)
    ea_drive_win = ea[pk : ea_fwd_end]
    ea_max_drive = float(np.max(ea_drive_win)) if len(ea_drive_win) > 0 else 0.0
    if ea_max_drive < EA_DRIVE_MIN:
        return None, f"ea_max={ea_max_drive:.0f}<{EA_DRIVE_MIN:.0f}"

    rec = {
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
        "peak_kin_speed": round(float(dsw_dot_3d[pk]), 3) if dsw_dot_3d is not None else None,
        "dur_s":        round((end_fi - start_fi) / fps, 3),
    }
    if dsw_gain_3d is not None:
        rec["dsw_gain_3d"] = round(dsw_gain_3d * 100, 2)  # store in cm
    return rec, None


def detect_jabs(sp_L, dsw_L, dsw_dot_L, ea_L,
                sp_R, dsw_R, dsw_dot_R, ea_R, fps,
                L_dsw_3d=None, R_dsw_3d=None,
                L_dsw_dot_3d=None, R_dsw_dot_3d=None):
    print("\nDetecting jab patterns...")
    punches        = []
    rejected_peaks = []

    for hand, sp, dsw, dsw_dot, ea, dsw_3d, dsw_dot_3d in [
        ("L", sp_L, dsw_L, dsw_dot_L, ea_L, L_dsw_3d, L_dsw_dot_3d),
        ("R", sp_R, dsw_R, dsw_dot_R, ea_R, R_dsw_3d, R_dsw_dot_3d),
    ]:
        ea_guard  = gauss_smooth(ea, 1.5)
        peaks     = _find_extension_peaks(sp, dsw_dot, dsw_dot_3d=dsw_dot_3d)
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

            result, reason = validate_jab_pattern(pk, sp, dsw, dsw_dot, ea_guard, fps,
                                                   dsw_3d=dsw_3d, dsw_dot_3d=dsw_dot_3d)

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
                gain_str = (f"gain_3d={result['dsw_gain_3d']:.1f}cm"
                            if "dsw_gain_3d" in result else f"gain={result['dsw_gain']:.0f}px")
                kin_str  = (f"  kin={result['peak_kin_speed']:.2f}m/s"
                            if result.get("peak_kin_speed") is not None else "")
                print(f"  [{hand}] #{count}  peak@{pk/fps:.2f}s  "
                      f"start={result['start_fi']/fps:.2f}s  end={result['end_fi']/fps:.2f}s  "
                      f"ea_min={result['ea_min']:.0f}°  ea_peak={result['ea_peak']:.0f}°  "
                      f"ea_max={result['ea_max_drive']:.0f}°  {gain_str}  "
                      f"spd={result['peak_speed']:.0f}px/s{kin_str}")

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
