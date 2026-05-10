import numpy as np
import cv2
from pathlib import Path

from core.landmarks import DRAW_JOINTS, SKEL, L_HIGHLIGHT, R_HIGHLIGHT
from core.jab_detect import EA_LOAD_MAX, EA_DRIVE_MIN, MIN_SPEED
_LW, _RW = 9, 10
CL = (80, 185, 63)
CR = (88, 166, 255)
CW = (255, 255, 255)

phase_colors = {
    "DRIVE":   (80,  255, 120),
    "MAX":     (255, 255,  60),
    "RETRACT": (200, 200, 200),
}


def put_text(frame, text, pos, color=(255,255,255), scale=0.6, thickness=1):
    cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_DUPLEX,
                scale, (0,0,0), thickness+2, cv2.LINE_AA)
    cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_DUPLEX,
                scale, color, thickness, cv2.LINE_AA)


def _pt(smooth_jx, smooth_jy, j, fi):
    x = smooth_jx[j][fi]; y = smooth_jy[j][fi]
    if np.isnan(x) or np.isnan(y): return None
    return int(x), int(y)


def render(video_path, out_stem, fps, H, W, n_frames,
           smooth_jx, smooth_jy,
           L_dsw, R_dsw, L_dsw_dot, R_dsw_dot,
           L_sp, R_sp, L_ea, R_ea,
           punches,
           imu_r=None, imu_l=None, sync_result=None):

    out_path = str(Path(out_stem).with_suffix(".mp4"))
    print(f"\nRendering {n_frames} frames → {out_path}")

    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
    cap    = cv2.VideoCapture(video_path)

    all_dsw = np.concatenate([L_dsw[~np.isnan(L_dsw)], R_dsw[~np.isnan(R_dsw)]])
    all_sp  = np.concatenate([L_sp[L_sp > 0], R_sp[R_sp > 0]])
    max_dsw = float(np.percentile(all_dsw, 95)) if len(all_dsw) > 10 else 300.0
    max_sp  = float(np.percentile(all_sp,  95)) if len(all_sp)  > 10 else 2000.0

    # precompute punch frame lookups
    frame_punch_L = {}; frame_punch_R = {}
    for p in punches:
        col  = CL if p["hand"] == "L" else CR
        dest = frame_punch_L if p["hand"] == "L" else frame_punch_R
        s, pk, e = p["start_fi"], p["peak_fi"], p["end_fi"]
        for fi_ in range(s, e + 1):
            phase = "DRIVE" if fi_ < pk else ("MAX" if fi_ == pk else "RETRACT")
            dest[fi_] = (p, phase, col)

    L_count_at = np.zeros(n_frames, dtype=int)
    R_count_at = np.zeros(n_frames, dtype=int)
    lc = rc = 0
    for fi_ in range(n_frames):
        if fi_ in frame_punch_L: lc = frame_punch_L[fi_][0]["punch"]
        if fi_ in frame_punch_R: rc = frame_punch_R[fi_][0]["punch"]
        L_count_at[fi_] = lc; R_count_at[fi_] = rc

    # pre-align IMU signals to video time if sync info available
    imu_r_acc = imu_l_acc = None
    if imu_r is not None and sync_result is not None:
        vid_ts = np.arange(n_frames) / fps
        imu_ts = imu_r.timestamps - sync_result.offset_R
        imu_r_acc = np.interp(vid_ts, imu_ts, imu_r.magnitude, left=0, right=0)
    if imu_l is not None and sync_result is not None:
        vid_ts = np.arange(n_frames) / fps
        imu_ts = imu_l.timestamps - sync_result.offset_L
        imu_l_acc = np.interp(vid_ts, imu_ts, imu_l.magnitude, left=0, right=0)

    fi = 0
    while fi < n_frames:
        ok, frame = cap.read()
        if not ok: break

        # skeleton
        for a, b in SKEL:
            pa = _pt(smooth_jx, smooth_jy, a, fi)
            pb = _pt(smooth_jx, smooth_jy, b, fi)
            if pa and pb:
                is_l = a in L_HIGHLIGHT or b in L_HIGHLIGHT
                is_r = a in R_HIGHLIGHT or b in R_HIGHLIGHT
                col  = CL if is_l else CR if is_r else (60, 60, 60)
                cv2.line(frame, pa, pb, col, 5 if (is_l or is_r) else 2, cv2.LINE_AA)
        for j in DRAW_JOINTS:
            p_ = _pt(smooth_jx, smooth_jy, j, fi)
            if p_:
                is_l = j in L_HIGHLIGHT; is_r = j in R_HIGHLIGHT
                col  = CL if is_l else CR if is_r else (50, 50, 50)
                r    = 9 if (is_l or is_r) else 5
                cv2.circle(frame, p_, r, col, -1, cv2.LINE_AA)
                if is_l or is_r:
                    cv2.circle(frame, p_, r+2, CW, 1, cv2.LINE_AA)

        # top hud
        ov = frame.copy()
        cv2.rectangle(ov, (0,0), (W,100), (15,15,15), -1)
        cv2.addWeighted(ov, 0.5, frame, 0.5, 0, frame)
        t_s = fi / fps
        put_text(frame, f"t = {t_s:.2f}s   frame {fi}/{n_frames}",
                 (14, 22), (200,200,200), 0.60)
        def _vi(v): return int(v) if not np.isnan(v) else 0
        put_text(frame,
                 f"L  sp={_vi(L_sp[fi]):4d}  d_sw={_vi(L_dsw[fi]):3d}  ea={L_ea[fi]:.0f}deg",
                 (14, 48), CL, 0.56)
        put_text(frame,
                 f"R  sp={_vi(R_sp[fi]):4d}  d_sw={_vi(R_dsw[fi]):3d}  ea={R_ea[fi]:.0f}deg",
                 (14, 72), CR, 0.56)
        put_text(frame, "px/s | px | angle", (14, 94), (140,140,140), 0.38)

        # right-side bars: ea | d_sw
        bar_top = 110; bar_h = 220; bar_bot = bar_top + bar_h
        bx = W - 105
        cv2.rectangle(frame, (bx, bar_top), (bx+44, bar_bot), (30,30,30), -1)
        put_text(frame, "d_sw", (bx+2, bar_top-12), (180,180,180), 0.38)

        def draw_dsw_bar(val, x_off, color):
            if np.isnan(val): return
            frac = min(float(val)/max_dsw, 1.0)
            fill = int(frac * bar_h)
            if fill > 0:
                cv2.rectangle(frame, (bx+x_off, bar_bot-fill),
                              (bx+x_off+20, bar_bot), color, -1)
        draw_dsw_bar(L_dsw[fi], 2, CL)
        draw_dsw_bar(R_dsw[fi], 22, CR)
        put_text(frame, f"{max_dsw:.0f}", (bx+46, bar_top+8), (100,100,100), 0.32)
        put_text(frame, f"{max_dsw/2:.0f}", (bx+46, bar_top+bar_h//2+4), (80,80,80), 0.32)
        cv2.line(frame, (bx, bar_top+bar_h//2), (bx+44, bar_top+bar_h//2), (60,60,60), 1)

        ebx = bx - 58
        cv2.rectangle(frame, (ebx, bar_top), (ebx+44, bar_bot), (30,30,30), -1)
        put_text(frame, "ea", (ebx+10, bar_top-12), (180,180,180), 0.38)

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

        # speed bar (left side)
        sx, sy, sw_b, sh = 14, 108, 18, 180
        cv2.rectangle(frame, (sx, sy), (sx+sw_b*2+10, sy+sh), (30,30,30), -1)
        def spd_bar(val, x_off, color):
            if np.isnan(val): return
            f = int(min(float(val)/max_sp, 1.0)*sh)
            cv2.rectangle(frame, (sx+x_off, sy+sh-f), (sx+x_off+sw_b, sy+sh), color, -1)
        spd_bar(L_sp[fi], 0, CL)
        spd_bar(R_sp[fi], sw_b+4, CR)
        put_text(frame, "spd", (sx, sy-12), (140,140,140), 0.38)
        if max_sp > 0:
            y_sp_thr = sy + sh - int(min(MIN_SPEED / max_sp, 1.0) * sh)
            cv2.line(frame, (sx, y_sp_thr), (sx+sw_b*2+10, y_sp_thr), (255,200,50), 1, cv2.LINE_AA)
            put_text(frame, f"{int(MIN_SPEED)}", (sx+sw_b*2+12, y_sp_thr+4), (255,200,50), 0.32)
        put_text(frame, f"{max_sp:.0f}", (sx+sw_b*2+12, sy+8), (100,100,100), 0.32)

        # IMU acceleration bars (right-far side) — only if IMU data available
        if imu_r_acc is not None or imu_l_acc is not None:
            max_g = 6.0
            ibx = W - 170; iby = bar_top; ibh = bar_h
            cv2.rectangle(frame, (ibx, iby), (ibx+40, iby+ibh), (25,25,25), -1)
            put_text(frame, "IMU g", (ibx, iby-12), (160,160,160), 0.35)
            def draw_imu_bar(acc_val, x_off, color):
                frac = min(float(acc_val) / max_g, 1.0)
                fill = int(frac * ibh)
                if fill > 0:
                    cv2.rectangle(frame, (ibx+x_off, iby+ibh-fill),
                                  (ibx+x_off+18, iby+ibh), color, -1)
            if imu_r_acc is not None:
                draw_imu_bar(imu_r_acc[fi], 2, CR)
            if imu_l_acc is not None:
                draw_imu_bar(imu_l_acc[fi], 22, CL)
            put_text(frame, f"{max_g:.0f}g", (ibx+42, iby+8), (100,100,100), 0.30)

        # punch overlays
        bw = 280; bh_b = 50; margin = 14
        for hand_fp, wrist_j, bx_anchor, hand_col, count_val in [
            (frame_punch_L, _LW, margin,      CL, int(L_count_at[fi])),
            (frame_punch_R, _RW, W-bw-margin, CR, int(R_count_at[fi])),
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
                lbl = "L" if hand_col == CL else "R"
                put_text(frame, f"{lbl}  #{num}", (bx_anchor+12, by_b+22), hand_col, 0.65, 2)
                put_text(frame, phase,            (bx_anchor+12, by_b+42), ptcol,    0.65, 2)
                wp = _pt(smooth_jx, smooth_jy, wrist_j, fi)
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
                put_text(frame, f"{lbl}  #{count_val}", (bx_anchor+12, by_b+32), dim, 0.65, 1)

        writer.write(frame)
        fi += 1
        if fi % 300 == 0:
            print(f"  frame {fi}/{n_frames}  t={fi/fps:.1f}s")

    cap.release(); writer.release()
    print(f"Done → {out_path}")
    return out_path
