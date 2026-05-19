import numpy as np
import cv2
from pathlib import Path

from core.landmarks import DRAW_JOINTS, SKEL, L_HIGHLIGHT, R_HIGHLIGHT
from core.jab_detect import EA_LOAD_MAX, EA_DRIVE_MIN, MIN_SPEED, MIN_KIN_SPEED
from core.signals import UPPER_ARM_M, FOREARM_M

MAX_REACH_CM = (UPPER_ARM_M + FOREARM_M) * 100   # ~60.8 cm full arm extension

_LW, _RW = 9, 10
CL = (80, 185, 63)
CR = (88, 166, 255)
CW = (255, 255, 255)

phase_colors = {
    "LOAD":    (0,   200, 255),
    "DRIVE":   (80,  255, 120),
    "MAX":     (255, 255,  60),
    "RETRACT": (200, 200, 200),
}


def put_text(frame, text, pos, color=(255,255,255), scale=0.6, thickness=1):
    cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_DUPLEX,
                scale, (0,0,0), thickness+2, cv2.LINE_AA)
    cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_DUPLEX,
                scale, color, thickness, cv2.LINE_AA)


def _pt(draw_jx, draw_jy, j, fi):
    x = draw_jx[j][fi]; y = draw_jy[j][fi]
    if np.isnan(x) or np.isnan(y): return None
    return int(x), int(y)


def render(video_path, out_stem, fps, H, W, n_frames,
           smooth_jx, smooth_jy,
           L_dsw, R_dsw, L_dsw_dot, R_dsw_dot,
           L_sp, R_sp, L_ea, R_ea,
           punches,
           interp_jx=None, interp_jy=None,
           imu_r=None, imu_l=None, sync_result=None,
           L_dsw_3d=None, R_dsw_3d=None,
           L_dsw_dot_3d=None, R_dsw_dot_3d=None,
           start_frame=0):

    out_path = str(Path(out_stem).with_suffix(".mp4"))
    print(f"\nRendering {n_frames} frames to {out_path}")

    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
    cap    = cv2.VideoCapture(video_path)

    all_dsw = np.concatenate([L_dsw[~np.isnan(L_dsw)], R_dsw[~np.isnan(R_dsw)]])
    all_sp  = np.concatenate([L_sp[L_sp > 0], R_sp[R_sp > 0]])
    max_dsw = float(np.percentile(all_dsw, 95)) if len(all_dsw) > 10 else 300.0
    max_sp  = float(np.percentile(all_sp,  95)) if len(all_sp)  > 10 else 2000.0

    all_kin = [a[a > 0] for a in [L_dsw_dot_3d, R_dsw_dot_3d] if a is not None]
    if all_kin:
        kin_cat = np.concatenate(all_kin)
        max_kin_sp = max(float(np.percentile(kin_cat, 95)) if len(kin_cat) > 10 else 3.0, 2.0)
    else:
        max_kin_sp = None

    # build per-frame punch lookup tables (LOAD phase only exists for uppercuts)
    frame_punch_L = {}; frame_punch_R = {}
    for p in punches:
        col     = CL if p["hand"] == "L" else CR
        dest    = frame_punch_L if p["hand"] == "L" else frame_punch_R
        s, pk, e = p["start_fi"], p["peak_fi"], p["end_fi"]
        is_uc   = p.get("type") == "uppercut"
        load_fi = p.get("load_fi", s) if is_uc else None
        for fi_ in range(s, e + 1):
            if is_uc and load_fi is not None and fi_ <= load_fi:
                phase = "LOAD"
            elif fi_ < pk:   phase = "DRIVE"
            elif fi_ == pk:  phase = "MAX"
            else:            phase = "RETRACT"
            dest[fi_] = (p, phase, col)

    L_count_at = np.zeros(n_frames, dtype=int)
    R_count_at = np.zeros(n_frames, dtype=int)
    lc = rc = 0
    for fi_ in range(n_frames):
        if fi_ in frame_punch_L: lc = frame_punch_L[fi_][0]["punch"]
        if fi_ in frame_punch_R: rc = frame_punch_R[fi_][0]["punch"]
        L_count_at[fi_] = lc; R_count_at[fi_] = rc

    # pre-align IMU signals to video time if sync info available
    # two-parameter model: imu_t = skew * video_t + offset
    # formula: video_t = (imu_t - offset) / skew
    imu_r_acc = imu_l_acc = None
    # vid_ts must be in original video time (not clip-relative) so IMU offsets align correctly
    vid_ts = start_frame / fps + np.arange(n_frames) / fps
    if imu_r is not None and sync_result is not None:
        imu_ts = (imu_r.timestamps - sync_result.offset_R) / sync_result.skew_R
        imu_r_acc = np.interp(vid_ts, imu_ts, imu_r.magnitude, left=0, right=0)
    if imu_l is not None and sync_result is not None:
        imu_ts = (imu_l.timestamps - sync_result.offset_L) / sync_result.skew_L
        imu_l_acc = np.interp(vid_ts, imu_ts, imu_l.magnitude, left=0, right=0)

    # use interp coords for skeleton if provided (avoids Gaussian smoothing
    # artifact that collapses short foreshortened bones and flips visual angle)
    draw_jx = interp_jx if interp_jx is not None else smooth_jx
    draw_jy = interp_jy if interp_jy is not None else smooth_jy

    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    fi = 0
    while fi < n_frames:
        ok, frame = cap.read()
        if not ok: break

        # skeleton
        for a, b in SKEL:
            pa = _pt(draw_jx, draw_jy, a, fi)
            pb = _pt(draw_jx, draw_jy, b, fi)
            if pa and pb:
                is_l = a in L_HIGHLIGHT or b in L_HIGHLIGHT
                is_r = a in R_HIGHLIGHT or b in R_HIGHLIGHT
                col  = CL if is_l else CR if is_r else (60, 60, 60)
                cv2.line(frame, pa, pb, col, 5 if (is_l or is_r) else 2, cv2.LINE_AA)
        for j in DRAW_JOINTS:
            p_ = _pt(draw_jx, draw_jy, j, fi)
            if p_:
                is_l = j in L_HIGHLIGHT; is_r = j in R_HIGHLIGHT
                col  = CL if is_l else CR if is_r else (50, 50, 50)
                r    = 9 if (is_l or is_r) else 5
                cv2.circle(frame, p_, r, col, -1, cv2.LINE_AA)
                if is_l or is_r:
                    cv2.circle(frame, p_, r+2, CW, 1, cv2.LINE_AA)

        # top hud
        ov = frame.copy()
        cv2.rectangle(ov, (0,0), (W,120), (15,15,15), -1)
        cv2.addWeighted(ov, 0.5, frame, 0.5, 0, frame)
        t_s = fi / fps
        put_text(frame, f"t = {t_s:.2f}s   frame {fi}/{n_frames}",
                 (14, 22), (200,200,200), 0.60)
        def _vi(v): return int(v) if not np.isnan(v) else 0
        def _cm(arr, i):
            if arr is None: return None
            v = arr[i]
            return None if np.isnan(v) else v * 100

        l_cm = _cm(L_dsw_3d, fi); r_cm = _cm(R_dsw_3d, fi)
        l_3d_str = f"  3D:{l_cm:4.1f}cm" if l_cm is not None else ""
        r_3d_str = f"  3D:{r_cm:4.1f}cm" if r_cm is not None else ""

        def _kin(arr, i):
            if arr is None: return None
            v = arr[i]
            return None if np.isnan(v) else float(v)
        l_kin = _kin(L_dsw_dot_3d, fi)
        r_kin = _kin(R_dsw_dot_3d, fi)
        l_kin_str = f"  ks={l_kin:+5.2f}" if l_kin is not None else ""
        r_kin_str = f"  ks={r_kin:+5.2f}" if r_kin is not None else ""

        put_text(frame,
                 f"L  sp={_vi(L_sp[fi]):4d}px/s{l_kin_str}m/s  dsw={_vi(L_dsw[fi]):3d}px{l_3d_str}  ea={L_ea[fi]:.0f}deg",
                 (14, 52), CL, 0.52)
        put_text(frame,
                 f"R  sp={_vi(R_sp[fi]):4d}px/s{r_kin_str}m/s  dsw={_vi(R_dsw[fi]):3d}px{r_3d_str}  ea={R_ea[fi]:.0f}deg",
                 (14, 82), CR, 0.52)
        put_text(frame, "bars:  2D spd | 3D spd | dsw 2D | dsw 3D | ea deg | IMU g",
                 (14, 112), (140,140,140), 0.38)

        # right-side bars: ea | d_sw 2D (px) | d_sw 3D (cm)
        bar_top = 130; bar_h = 220; bar_bot = bar_top + bar_h
        # 3D bar (rightmost)
        bx3 = W - 105
        cv2.rectangle(frame, (bx3, bar_top), (bx3+44, bar_bot), (30,30,30), -1)
        put_text(frame, "3D cm", (bx3, bar_top-12), (180,220,180), 0.40)
        def draw_3d_bar(val_cm, x_off, color):
            if val_cm is None or np.isnan(val_cm): return
            frac = min(float(val_cm) / MAX_REACH_CM, 1.0)
            fill = int(frac * bar_h)
            if fill > 0:
                cv2.rectangle(frame, (bx3+x_off, bar_bot-fill),
                              (bx3+x_off+20, bar_bot), color, -1)
        draw_3d_bar(l_cm, 2, CL)
        draw_3d_bar(r_cm, 22, CR)
        put_text(frame, f"{MAX_REACH_CM:.0f}", (bx3+46, bar_top+8), (100,100,100), 0.28)
        put_text(frame, f"{MAX_REACH_CM/2:.0f}", (bx3+46, bar_top+bar_h//2+4), (80,80,80), 0.28)
        cv2.line(frame, (bx3, bar_top+bar_h//2), (bx3+44, bar_top+bar_h//2), (60,60,60), 1)

        # 2D bar (left of 3D)
        bx = bx3 - 58
        cv2.rectangle(frame, (bx, bar_top), (bx+44, bar_bot), (30,30,30), -1)
        put_text(frame, "2D px", (bx, bar_top-12), (180,180,180), 0.40)
        def draw_dsw_bar(val, x_off, color):
            if np.isnan(val): return
            frac = min(float(val)/max_dsw, 1.0)
            fill = int(frac * bar_h)
            if fill > 0:
                cv2.rectangle(frame, (bx+x_off, bar_bot-fill),
                              (bx+x_off+20, bar_bot), color, -1)
        draw_dsw_bar(L_dsw[fi], 2, CL)
        draw_dsw_bar(R_dsw[fi], 22, CR)
        put_text(frame, f"{max_dsw:.0f}", (bx+46, bar_top+8), (100,100,100), 0.28)
        put_text(frame, f"{max_dsw/2:.0f}", (bx+46, bar_top+bar_h//2+4), (80,80,80), 0.28)
        cv2.line(frame, (bx, bar_top+bar_h//2), (bx+44, bar_top+bar_h//2), (60,60,60), 1)

        ebx = bx - 58   # ea bar left of the 2D d_sw bar
        cv2.rectangle(frame, (ebx, bar_top), (ebx+44, bar_bot), (30,30,30), -1)
        put_text(frame, "ea deg", (ebx, bar_top-12), (180,180,180), 0.40)

        def draw_ea_bar(val, x_off, color):
            frac = min(float(val) / 180.0, 1.0)
            fill = int(frac * bar_h)
            if fill > 0:
                cv2.rectangle(frame, (ebx+x_off, bar_bot-fill),
                              (ebx+x_off+20, bar_bot), color, -1)
        draw_ea_bar(L_ea[fi], 2, CL)
        draw_ea_bar(R_ea[fi], 22, CR)
        put_text(frame, "180", (ebx+46, bar_top+8), (100,100,100), 0.32)
        y_ea_drv = bar_bot - int(EA_DRIVE_MIN / 180.0 * bar_h)
        cv2.line(frame, (ebx, y_ea_drv), (ebx+44, y_ea_drv), (255,200,50), 1, cv2.LINE_AA)
        put_text(frame, f"{EA_DRIVE_MIN:.0f}", (ebx+46, y_ea_drv+4), (255,200,50), 0.32)
        y_ea_ld = bar_bot - int(EA_LOAD_MAX / 180.0 * bar_h)
        cv2.line(frame, (ebx, y_ea_ld), (ebx+44, y_ea_ld), (200,80,80), 1, cv2.LINE_AA)
        put_text(frame, f"{EA_LOAD_MAX:.0f}", (ebx+46, y_ea_ld+4), (200,80,80), 0.32)

        # 2D speed bar (left side)
        sx, sy, sw_b, sh = 14, 128, 18, 180
        cv2.rectangle(frame, (sx, sy), (sx+sw_b*2+10, sy+sh), (30,30,30), -1)
        def spd_bar(val, x_off, color):
            if np.isnan(val): return
            f = int(min(float(val)/max_sp, 1.0)*sh)
            cv2.rectangle(frame, (sx+x_off, sy+sh-f), (sx+x_off+sw_b, sy+sh), color, -1)
        spd_bar(L_sp[fi], 0, CL)
        spd_bar(R_sp[fi], sw_b+4, CR)
        put_text(frame, "2D px/s", (sx, sy-12), (140,140,140), 0.35)
        if max_sp > 0:
            y_sp_thr = sy + sh - int(min(MIN_SPEED / max_sp, 1.0) * sh)
            cv2.line(frame, (sx, y_sp_thr), (sx+sw_b*2+10, y_sp_thr), (255,200,50), 1, cv2.LINE_AA)
            put_text(frame, f"{int(MIN_SPEED)}", (sx+sw_b*2+12, y_sp_thr+4), (255,200,50), 0.32)
        put_text(frame, f"{max_sp:.0f}", (sx+sw_b*2+12, sy+8), (100,100,100), 0.32)

        # kinematic speed bar (3D extension rate in m/s), drawn to the right of the 2D bar
        if max_kin_sp is not None:
            ksx = sx + sw_b*2 + 10 + 18
            cv2.rectangle(frame, (ksx, sy), (ksx+sw_b*2+10, sy+sh), (30,30,30), -1)
            def kin_bar(val, x_off, color):
                if val is None or np.isnan(val): return
                f = int(min(abs(float(val))/max_kin_sp, 1.0)*sh)
                # positive = extending (bright), negative = retracting (dim)
                col = color if val >= 0 else tuple(int(c*0.4) for c in color)
                cv2.rectangle(frame, (ksx+x_off, sy+sh-f), (ksx+x_off+sw_b, sy+sh), col, -1)
            kin_bar(l_kin, 0, CL)
            kin_bar(r_kin, sw_b+4, CR)
            put_text(frame, "3D m/s", (ksx, sy-12), (160,210,160), 0.35)
            y_kin_thr = sy + sh - int(min(MIN_KIN_SPEED / max_kin_sp, 1.0) * sh)
            cv2.line(frame, (ksx, y_kin_thr), (ksx+sw_b*2+10, y_kin_thr), (255,200,50), 1, cv2.LINE_AA)
            put_text(frame, f"{MIN_KIN_SPEED:.1f}", (ksx+sw_b*2+12, y_kin_thr+4), (255,200,50), 0.32)
            put_text(frame, f"{max_kin_sp:.1f}", (ksx+sw_b*2+12, sy+8), (100,100,100), 0.32)

        # IMU acceleration bars, placed to the right of the 3D bar
        if imu_r_acc is not None or imu_l_acc is not None:
            max_g = 6.0
            ibx = bx3 + 58; iby = bar_top; ibh = bar_h
            cv2.rectangle(frame, (ibx, iby), (ibx+44, iby+ibh), (25,25,25), -1)
            put_text(frame, "IMU g", (ibx, iby-12), (200,200,160), 0.40)
            def draw_imu_bar(acc_val, x_off, color):
                frac = min(float(acc_val) / max_g, 1.0)
                fill = int(frac * ibh)
                if fill > 0:
                    cv2.rectangle(frame, (ibx+x_off, iby+ibh-fill),
                                  (ibx+x_off+20, iby+ibh), color, -1)
            if imu_r_acc is not None:
                draw_imu_bar(imu_r_acc[fi], 2, CR)
            if imu_l_acc is not None:
                draw_imu_bar(imu_l_acc[fi], 22, CL)
            put_text(frame, f"{max_g:.0f}g", (ibx+46, iby+8), (160,160,100), 0.38)
            put_text(frame, "R", (ibx+4,  iby+ibh+14), CR, 0.38)
            put_text(frame, "L", (ibx+24, iby+ibh+14), CL, 0.38)

        # punch overlays
        bw = 310; bh_b = 68; margin = 14
        for hand_fp, wrist_j, bx_anchor, hand_col, count_val, dsw3d_arr in [
            (frame_punch_L, _LW, margin,      CL, int(L_count_at[fi]), L_dsw_3d),
            (frame_punch_R, _RW, W-bw-margin, CR, int(R_count_at[fi]), R_dsw_3d),
        ]:
            by_b = H - bh_b - 10
            if fi in hand_fp:
                p_, phase, _ = hand_fp[fi]
                num   = p_["punch"]
                ptcol = phase_colors.get(phase, (200,200,200))
                if phase == "MAX":
                    flash = frame.copy()
                    cv2.rectangle(flash, (0,0), (W,H), hand_col, -1)
                    cv2.addWeighted(flash, 0.10, frame, 0.90, 0, frame)
                ov2 = frame.copy()
                cv2.rectangle(ov2, (bx_anchor,by_b), (bx_anchor+bw,by_b+bh_b), (15,15,15), -1)
                cv2.addWeighted(ov2, 0.55, frame, 0.45, 0, frame)
                cv2.rectangle(frame, (bx_anchor,by_b), (bx_anchor+bw,by_b+bh_b), hand_col, 2)
                lbl   = "L" if hand_col == CL else "R"
                ptype = "UC" if p_.get("type") == "uppercut" else "JAB"
                put_text(frame, f"{lbl} {ptype} #{num}", (bx_anchor+12, by_b+20), hand_col, 0.65, 2)
                put_text(frame, phase,                   (bx_anchor+12, by_b+40), ptcol,    0.55, 1)

                # 3D gain: live cm gained from start of punch to now
                if dsw3d_arr is not None:
                    sfi = p_["start_fi"]
                    v_now   = dsw3d_arr[fi]
                    v_start = dsw3d_arr[sfi]
                    if not (np.isnan(v_now) or np.isnan(v_start)):
                        gain_live_cm = (v_now - v_start) * 100
                        gain_col  = (255, 255, 80) if gain_live_cm > 0 else (200, 100, 100)
                        gain_str  = f"+{gain_live_cm:.1f}cm" if gain_live_cm >= 0 else f"{gain_live_cm:.1f}cm"
                        put_text(frame, gain_str, (bx_anchor + 130, by_b+40), gain_col, 0.55, 1)

                    # reach meter: horizontal bar showing arm extension % of full reach
                    rm_x = bx_anchor + 12; rm_y = by_b + 56; rm_w = bw - 24; rm_h = 8
                    cv2.rectangle(frame, (rm_x, rm_y), (rm_x+rm_w, rm_y+rm_h), (40,40,40), -1)
                    reach_frac = min(float(v_now) * 100 / MAX_REACH_CM, 1.0) if not np.isnan(v_now) else 0.0
                    fill_w = int(reach_frac * rm_w)
                    if fill_w > 0:
                        cv2.rectangle(frame, (rm_x, rm_y), (rm_x+fill_w, rm_y+rm_h), hand_col, -1)
                    put_text(frame, f"{reach_frac*100:.0f}% reach", (rm_x+rm_w+4, rm_y+rm_h), (150,150,150), 0.32)

                wp = _pt(draw_jx, draw_jy, wrist_j, fi)
                if wp:
                    cv2.circle(frame, wp, 18, hand_col, 2, cv2.LINE_AA)
                    cv2.circle(frame, wp, 22, CW, 1, cv2.LINE_AA)
                st = p_["start_fi"]; en = p_["end_fi"]
                prog  = (fi - st) / max(en - st, 1)
                pb_x  = bx_anchor + bw + 4 if hand_col == CL else bx_anchor - 18
                pb_y  = H - 200; pb_h = 160
                cv2.rectangle(frame, (pb_x,pb_y), (pb_x+14,pb_y+pb_h), (30,30,30), -1)
                fill_h = int(prog * pb_h)
                cv2.rectangle(frame, (pb_x,pb_y+pb_h-fill_h), (pb_x+14,pb_y+pb_h), hand_col, -1)
            else:
                lbl = "L" if hand_col == CL else "R"
                dim = tuple(int(c*0.45) for c in hand_col)
                ov2 = frame.copy()
                cv2.rectangle(ov2, (bx_anchor,by_b), (bx_anchor+bw,by_b+bh_b), (12,12,12), -1)
                cv2.addWeighted(ov2, 0.45, frame, 0.55, 0, frame)
                cv2.rectangle(frame, (bx_anchor,by_b), (bx_anchor+bw,by_b+bh_b), dim, 1)
                put_text(frame, f"{lbl}  #{count_val}", (bx_anchor+12, by_b+40), dim, 0.65, 1)

        writer.write(frame)
        fi += 1
        if fi % 300 == 0:
            print(f"  frame {fi}/{n_frames}  t={fi/fps:.1f}s")

    cap.release(); writer.release()
    print(f"Done. Saved to {out_path}")
    return out_path
