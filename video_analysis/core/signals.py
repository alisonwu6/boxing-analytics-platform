import math
import numpy as np

from core.landmarks import DRAW_JOINTS

_LW, _LE, _LS = 9, 7, 5
_RW, _RE, _RS = 10, 8, 6

SKEL_SIGMA = 1.5

# Anthropometric constants for a 6 ft (1.83 m) boxer
BOXER_HEIGHT_M   = 1.83

UPPER_ARM_M      = BOXER_HEIGHT_M * 0.186   # ~0.340 m (humerus)
FOREARM_M        = BOXER_HEIGHT_M * 0.146   # ~0.267 m (radius/ulna)


def gauss_smooth(arr, sigma=1.5):
    k = max(3, int(6*sigma)|1); h = k//2
    ker = np.exp(-0.5*((np.arange(k)-h)/sigma)**2); ker /= ker.sum()
    return np.convolve(arr, ker, mode="same")


def short_interp(a, max_gap=8):
    out = a.copy(); nans = np.isnan(out)
    if not nans.any() or nans.all(): return out
    in_gap = False; gap_start = 0
    for k in range(len(out)):
        if nans[k]:
            if not in_gap: gap_start = k; in_gap = True
        else:
            if in_gap:
                if k - gap_start <= max_gap:
                    ok = np.where(~nans)[0]
                    out[gap_start:k] = np.interp(np.arange(gap_start, k), ok, a[ok])
                in_gap = False
    return out


def _ffill(a):
    out = a.copy(); last = np.nan
    for i in range(len(out)):
        if np.isnan(out[i]): out[i] = last
        else: last = out[i]
    last = np.nan
    for i in range(len(out)-1, -1, -1):
        if np.isnan(out[i]): out[i] = last
        else: last = out[i]
    return out


def elbow_angle(wx, wy, ex, ey, sx, sy):
    ew = (wx-ex, wy-ey); es = (sx-ex, sy-ey)
    dot = ew[0]*es[0] + ew[1]*es[1]
    mag = math.hypot(*ew) * math.hypot(*es)
    if mag < 1e-6: return float("nan")
    return math.degrees(math.acos(max(-1.0, min(1.0, dot/mag))))


def smooth_joints(raw_jx, raw_jy):
    print("Pre-smoothing skeleton joints...")
    sjx = {}; sjy = {}
    for j in DRAW_JOINTS:
        rx = short_interp(raw_jx[j]); ry = short_interp(raw_jy[j])
        valid = ~np.isnan(rx)
        if valid.sum() > 5:
            rx[valid] = gauss_smooth(rx[valid], SKEL_SIGMA)
            ry[valid] = gauss_smooth(ry[valid], SKEL_SIGMA)
        sjx[j] = rx; sjy[j] = ry
    return sjx, sjy


def smooth_joints_savgol(raw_jx, raw_jy, window=9, polyorder=3):
    from scipy.signal import savgol_filter
    print(f"Smoothing skeleton (Savitzky-Golay w={window} p={polyorder})...")
    sjx = {}; sjy = {}
    for j in DRAW_JOINTS:
        rx = short_interp(raw_jx[j]); ry = short_interp(raw_jy[j])
        valid = ~np.isnan(rx)
        if valid.sum() > window:
            rx[valid] = savgol_filter(rx[valid], window, polyorder)
            ry[valid] = savgol_filter(ry[valid], window, polyorder)
        sjx[j] = rx; sjy[j] = ry
    return sjx, sjy


def _bilateral_1d(arr, sigma_space=1.5, sigma_val=15.0):
    n = len(arr); h = max(1, int(3 * sigma_space))
    out = np.empty_like(arr)
    for i in range(n):
        lo = max(0, i - h); hi = min(n, i + h + 1)
        window = arr[lo:hi]
        di     = np.arange(lo - i, hi - i)
        ws     = np.exp(-0.5 * (di / sigma_space) ** 2)
        wv     = np.exp(-0.5 * ((window - arr[i]) / sigma_val) ** 2)
        w      = ws * wv
        out[i] = np.dot(w, window) / w.sum()
    return out


def smooth_joints_bilateral(raw_jx, raw_jy, sigma_space=1.5, sigma_val=15.0):
    print(f"Smoothing skeleton (Bilateral σ_space={sigma_space} σ_val={sigma_val}px)...")
    sjx = {}; sjy = {}
    for j in DRAW_JOINTS:
        rx = short_interp(raw_jx[j]); ry = short_interp(raw_jy[j])
        valid = ~np.isnan(rx)
        if valid.sum() > 5:
            rx[valid] = _bilateral_1d(rx[valid], sigma_space, sigma_val)
            ry[valid] = _bilateral_1d(ry[valid], sigma_space, sigma_val)
        sjx[j] = rx; sjy[j] = ry
    return sjx, sjy


def smooth_joints_adaptive(smooth_jx, smooth_jy, interp_jx, interp_jy, punches, n_frames):
    print("Smoothing skeleton (Adaptive: smooth outside punches, raw inside)...")
    mask = np.zeros(n_frames, dtype=bool)
    for p in punches:
        mask[p["start_fi"]: p["end_fi"] + 1] = True
    ajx = {}; ajy = {}
    for j in DRAW_JOINTS:
        rx = smooth_jx[j].copy(); ry = smooth_jy[j].copy()
        rx[mask] = interp_jx[j][mask]
        ry[mask] = interp_jy[j][mask]
        ajx[j] = rx; ajy[j] = ry
    return ajx, ajy



def interp_joints(raw_jx, raw_jy):
    jx = {}; jy = {}
    for j in DRAW_JOINTS:
        jx[j] = short_interp(raw_jx[j])
        jy[j] = short_interp(raw_jy[j])
    return jx, jy


def compute_signals(jx, jy, n_frames, fps):
    lw_x = jx[_LW]; lw_y = jy[_LW]
    le_x = jx[_LE]; le_y = jy[_LE]
    ls_x = jx[_LS]; ls_y = jy[_LS]
    rw_x = jx[_RW]; rw_y = jy[_RW]
    re_x = jx[_RE]; re_y = jy[_RE]
    rs_x = jx[_RS]; rs_y = jy[_RS]

    lw_xf = _ffill(lw_x); lw_yf = _ffill(lw_y)
    ls_xf = _ffill(ls_x); ls_yf = _ffill(ls_y)
    rw_xf = _ffill(rw_x); rw_yf = _ffill(rw_y)
    rs_xf = _ffill(rs_x); rs_yf = _ffill(rs_y)
    le_xf = _ffill(le_x); le_yf = _ffill(le_y)
    re_xf = _ffill(re_x); re_yf = _ffill(re_y)

    L_dsw = np.sqrt((lw_xf - ls_xf)**2 + (lw_yf - ls_yf)**2)
    R_dsw = np.sqrt((rw_xf - rs_xf)**2 + (rw_yf - rs_yf)**2)
    L_dsw[np.isnan(lw_x) | np.isnan(ls_x)] = np.nan
    R_dsw[np.isnan(rw_x) | np.isnan(rs_x)] = np.nan

    L_dsw_dot = np.gradient(np.nan_to_num(L_dsw)) * fps
    R_dsw_dot = np.gradient(np.nan_to_num(R_dsw)) * fps
    L_dsw_dot[np.isnan(L_dsw)] = 0.0
    R_dsw_dot[np.isnan(R_dsw)] = 0.0

    L_sp = np.sqrt(np.gradient(lw_xf)**2 + np.gradient(lw_yf)**2) * fps
    R_sp = np.sqrt(np.gradient(rw_xf)**2 + np.gradient(rw_yf)**2) * fps
    L_sp[np.isnan(lw_x)] = 0.0
    R_sp[np.isnan(rw_x)] = 0.0

    L_ea = np.array([elbow_angle(lw_xf[i],lw_yf[i],le_xf[i],le_yf[i],ls_xf[i],ls_yf[i])
                     for i in range(n_frames)])
    R_ea = np.array([elbow_angle(rw_xf[i],rw_yf[i],re_xf[i],re_yf[i],rs_xf[i],rs_yf[i])
                     for i in range(n_frames)])
    L_ea = np.nan_to_num(L_ea, nan=90.0)
    R_ea = np.nan_to_num(R_ea, nan=90.0)

    print(f"  d_sw range - L:{np.nanmin(L_dsw):.0f}-{np.nanmax(L_dsw):.0f}px  "
          f"R:{np.nanmin(R_dsw):.0f}-{np.nanmax(R_dsw):.0f}px")
    print(f"  Speed peaks (99th pct) - L:{np.nanpercentile(L_sp[L_sp>0],99):.0f}  "
          f"R:{np.nanpercentile(R_sp[R_sp>0],99):.0f} px/s")

    # compute 3D arm extension using the law of cosines with the measured elbow angle
    # and known bone lengths - this works even when the punch goes toward the camera
    ea_L_rad = np.radians(L_ea)
    ea_R_rad = np.radians(R_ea)
    L_dsw_3d = np.sqrt(UPPER_ARM_M**2 + FOREARM_M**2
                       - 2*UPPER_ARM_M*FOREARM_M*np.cos(ea_L_rad))
    R_dsw_3d = np.sqrt(UPPER_ARM_M**2 + FOREARM_M**2
                       - 2*UPPER_ARM_M*FOREARM_M*np.cos(ea_R_rad))

    L_dsw_dot_3d = np.gradient(L_dsw_3d) * fps
    R_dsw_dot_3d = np.gradient(R_dsw_3d) * fps

    print(f"  d_sw_3d range - L:{np.min(L_dsw_3d)*100:.1f}-{np.max(L_dsw_3d)*100:.1f}cm  "
          f"R:{np.min(R_dsw_3d)*100:.1f}-{np.max(R_dsw_3d)*100:.1f}cm")

    return L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea, \
           L_dsw_3d, R_dsw_3d, L_dsw_dot_3d, R_dsw_dot_3d


def compute_uc_signals(jx, jy, fps):
    # computes vertical wrist velocity and wrist-above-elbow ratio for uppercut detection
    lw_x = jx[_LW]; lw_y = jy[_LW]
    le_x = jx[_LE]; le_y = jy[_LE]
    ls_x = jx[_LS]; ls_y = jy[_LS]
    rw_x = jx[_RW]; rw_y = jy[_RW]
    re_x = jx[_RE]; re_y = jy[_RE]
    rs_x = jx[_RS]; rs_y = jy[_RS]

    lw_yf = _ffill(lw_y); rw_yf = _ffill(rw_y)
    le_yf = _ffill(le_y); re_yf = _ffill(re_y)
    ls_yf = _ffill(ls_y); rs_yf = _ffill(rs_y)

    L_vy = np.gradient(lw_yf) * fps
    R_vy = np.gradient(rw_yf) * fps
    L_vy[np.isnan(lw_x)] = 0.0
    R_vy[np.isnan(rw_x)] = 0.0

    # wa_ratio: (elbow_y - wrist_y) / (|elbow_y - shoulder_y| + ε)
    # positive = wrist above elbow (guard), negative = wrist below (load position)
    L_wa = (le_yf - lw_yf) / (np.abs(le_yf - ls_yf) + 1e-6)
    R_wa = (re_yf - rw_yf) / (np.abs(re_yf - rs_yf) + 1e-6)
    L_wa[np.isnan(lw_x) | np.isnan(le_x) | np.isnan(ls_x)] = 0.0
    R_wa[np.isnan(rw_x) | np.isnan(re_x) | np.isnan(rs_x)] = 0.0

    return L_vy, R_vy, L_wa, R_wa


def hip_y_signal(raw_jx, raw_jy, n_frames, fps):
    # averages left and right hip Y positions to get a single hip signal for jump detection
    # returns (timestamps, hip_y, acc_y)
    lh_y = raw_jy.get(11, np.full(n_frames, np.nan))
    rh_y = raw_jy.get(12, np.full(n_frames, np.nan))
    hip  = np.where(~np.isnan(lh_y) & ~np.isnan(rh_y),
                    (lh_y + rh_y) / 2,
                    np.where(~np.isnan(lh_y), lh_y, rh_y))
    filled = hip.copy(); last = np.nan
    for i in range(len(filled)):
        if np.isnan(filled[i]): filled[i] = last
        else: last = filled[i]
    vel  = np.gradient(filled) * fps
    acc  = np.gradient(vel) * fps
    ts   = np.arange(n_frames) / fps
    return ts, hip, acc
