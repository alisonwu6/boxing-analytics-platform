import math
import numpy as np

from core.landmarks import DRAW_JOINTS

_LW, _LE, _LS = 9, 7, 5
_RW, _RE, _RS = 10, 8, 6

SKEL_SIGMA = 1.5


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


def elbow_angle(wx, wy, ex, ey, sx, sy):
    ew = (wx-ex, wy-ey); es = (sx-ex, sy-ey)
    dot = ew[0]*es[0] + ew[1]*es[1]
    mag = math.hypot(*ew) * math.hypot(*es)
    if mag < 1e-6: return float("nan")
    return math.degrees(math.acos(max(-1.0, min(1.0, dot/mag))))


def smooth_joints(raw_jx, raw_jy):
    print("Pre-smoothing skeleton joints…")
    sjx = {}; sjy = {}
    for j in DRAW_JOINTS:
        rx = short_interp(raw_jx[j]); ry = short_interp(raw_jy[j])
        valid = ~np.isnan(rx)
        if valid.sum() > 5:
            rx[valid] = gauss_smooth(rx[valid], SKEL_SIGMA)
            ry[valid] = gauss_smooth(ry[valid], SKEL_SIGMA)
        sjx[j] = rx; sjy[j] = ry
    return sjx, sjy


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

    print(f"  d_sw range — L:{np.nanmin(L_dsw):.0f}–{np.nanmax(L_dsw):.0f}px  "
          f"R:{np.nanmin(R_dsw):.0f}–{np.nanmax(R_dsw):.0f}px")
    print(f"  Speed peaks (99th pct) — L:{np.nanpercentile(L_sp[L_sp>0],99):.0f}  "
          f"R:{np.nanpercentile(R_sp[R_sp>0],99):.0f} px/s")

    return L_dsw, R_dsw, L_dsw_dot, R_dsw_dot, L_sp, R_sp, L_ea, R_ea


def hip_y_signal(raw_jx, raw_jy, n_frames, fps):
    """Extract a hip-Y signal for jump detection — averages L/R hip, returns (timestamps, hip_y, acc_y)."""
    lh_y = raw_jy.get(11, np.full(n_frames, np.nan))
    rh_y = raw_jy.get(12, np.full(n_frames, np.nan))
    hip  = np.where(~np.isnan(lh_y) & ~np.isnan(rh_y),
                    (lh_y + rh_y) / 2,
                    np.where(~np.isnan(lh_y), lh_y, rh_y))
    # fill gaps for gradient
    filled = hip.copy(); last = np.nan
    for i in range(len(filled)):
        if np.isnan(filled[i]): filled[i] = last
        else: last = filled[i]
    vel  = np.gradient(filled) * fps
    acc  = np.gradient(vel) * fps
    ts   = np.arange(n_frames) / fps
    return ts, hip, acc
