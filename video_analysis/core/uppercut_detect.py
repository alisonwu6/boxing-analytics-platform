import numpy as np
from core.signals import gauss_smooth

UC_EA_MAX      = 160.0   # elbow must be bent; fully straight arm is not an uppercut
UC_WA_LOAD_MAX = -0.25   # wrist must be clearly below elbow (jab guard is near-zero, not negative)
UC_VY_FRAC_MIN =  0.30   # at peak, at least 30% of total speed must be upward
UC_SPEED_MIN   =  400.0  # px/s - minimum peak speed to be considered a punch


def _find_upward_peaks(sp, vy):
    # for each continuous upward movement (vy < 0), pick the frame with the highest speed
    peaks = []; n = len(vy); i = 0
    while i < n:
        if vy[i] < 0:
            seg_start = i
            while i < n and vy[i] < 0:
                i += 1
            best = int(np.argmax(sp[seg_start:i])) + seg_start
            peaks.append(best)
        else:
            i += 1
    return peaks


def validate_uppercut_pattern(pk, sp, vy, wa, ea, fps):
    # checks three things before accepting a peak as an uppercut:
    # 1. Load - wrist must drop below elbow in the 0.5s before the peak
    # 2. Upward fraction - at least 30% of the total speed at peak must be upward
    # 3. Arm angle - elbow must be bent at peak (not a fully extended jab)
    # returns (record_dict, None) on pass, or (None, reason_str) on fail
    lookback  = int(0.50 * fps)
    lookahead = int(0.60 * fps)

    load_win = wa[max(0, pk - lookback): pk]
    if len(load_win) == 0:
        return None, "no_lookback"
    load_min_val = float(np.min(load_win))
    load_fi      = max(0, pk - lookback) + int(np.argmin(load_win))
    if load_min_val >= UC_WA_LOAD_MAX:
        return None, f"wa_min={load_min_val:.3f}>={UC_WA_LOAD_MAX}"

    sp_pk = float(sp[pk])
    if sp_pk < UC_SPEED_MIN:
        return None, f"speed={sp_pk:.0f}<{UC_SPEED_MIN:.0f}"
    if (-float(vy[pk]) / sp_pk) < UC_VY_FRAC_MIN:
        return None, f"weak_upward={-float(vy[pk])/sp_pk:.2f}<{UC_VY_FRAC_MIN}"

    ea_pk = float(ea[pk])
    if ea_pk >= UC_EA_MAX:
        return None, f"ea={ea_pk:.0f}>={UC_EA_MAX:.0f}"

    start_fi = max(0, pk - lookback)
    for i in range(pk - 1, max(0, pk - lookback), -1):
        if float(vy[i]) >= 0:
            start_fi = i
            break

    end_fi = min(len(vy) - 1, pk + lookahead)
    for i in range(pk + 1, min(len(vy), pk + lookahead)):
        if float(vy[i]) >= 0:
            end_fi = i
            break

    return {
        "type":        "uppercut",
        "start_fi":    start_fi,
        "load_fi":     load_fi,
        "peak_fi":     pk,
        "end_fi":      end_fi,
        "load_min_wa": round(load_min_val, 3),
        "peak_wa":     round(float(wa[pk]), 3),
        "peak_vy":     round(float(vy[pk]), 1),
        "peak_ea":     round(ea_pk, 1),
        "peak_speed":  round(float(sp[pk]), 1),
        "dur_s":       round((end_fi - start_fi) / fps, 3),
    }, None


def detect_uppercuts(sp_L, vy_L, wa_L, ea_L,
                     sp_R, vy_R, wa_R, ea_R, fps):
    print("\nDetecting uppercut patterns...")
    punches        = []
    rejected_peaks = []

    for hand, sp, vy, wa, ea in [
        ("L", sp_L, vy_L, wa_L, ea_L),
        ("R", sp_R, vy_R, wa_R, ea_R),
    ]:
        ea_guard  = gauss_smooth(ea, 1.5)   # smoothed only for the geo guard
        peaks     = _find_upward_peaks(sp, vy)
        count     = 0
        cycle_end = -1

        for pk in peaks:
            if pk <= cycle_end:
                rejected_peaks.append({
                    "hand": hand, "peak_fi": pk,
                    "peak_t": round(pk / fps, 3), "reason": "in_cycle",
                    "sp": round(float(sp[pk]), 1),
                    "vy": round(float(vy[pk]), 1),
                    "wa": round(float(wa[pk]), 3),
                })
                continue

            result, reason = validate_uppercut_pattern(pk, sp, vy, wa, ea_guard, fps)

            if result is None:
                rejected_peaks.append({
                    "hand": hand, "peak_fi": pk,
                    "peak_t": round(pk / fps, 3), "reason": reason,
                    "sp": round(float(sp[pk]), 1),
                    "vy": round(float(vy[pk]), 1),
                    "wa": round(float(wa[pk]), 3),
                })
            else:
                if result["load_fi"] <= cycle_end:
                    rejected_peaks.append({
                        "hand": hand, "peak_fi": pk,
                        "peak_t": round(pk / fps, 3), "reason": "borrowed_load",
                        "sp": round(float(sp[pk]), 1),
                        "vy": round(float(vy[pk]), 1),
                        "wa": round(float(wa[pk]), 3),
                    })
                    continue

                cycle_end       = result["end_fi"]
                count          += 1
                result["hand"]  = hand
                result["punch"] = count
                punches.append(result)
                print(f"  [{hand}] #{count}  peak@{pk/fps:.2f}s  "
                      f"start={result['start_fi']/fps:.2f}s  "
                      f"end={result['end_fi']/fps:.2f}s  "
                      f"load_wa={result['load_min_wa']:.3f}  "
                      f"ea={result['peak_ea']:.0f}deg  "
                      f"spd={result['peak_speed']:.0f}px/s")

        print(f"  [{hand}] {count} uppercuts confirmed out of {len(peaks)} peaks")

    return punches, rejected_peaks
