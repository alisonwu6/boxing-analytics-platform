import math
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision
    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False

# COCO joint indices we care about (shoulder through ankle)
DRAW_JOINTS = list(range(5, 17))

# MediaPipe landmark index to COCO index
_MP_TO_COCO = {11:5, 12:6, 13:7, 14:8, 15:9, 16:10,
               23:11, 24:12, 25:13, 26:14, 27:15, 28:16}

SKEL        = [(5,7),(7,9),(6,8),(8,10),(5,6),(5,11),(6,12),(11,12),
               (11,13),(13,15),(12,14),(14,16)]
L_HIGHLIGHT = {9, 7, 5}
R_HIGHLIGHT = {10, 8, 6}

# 3-state machine constants
BOXER_CALIB_FRAMES   = 60
TORSO_JUMP_THR       = 250
SHOULDER_WIDTH_RATIO = 1.35
REACQ_SHW_MARGIN     = 0.60
OCCLUSION_CONFIRM    = 6
REACQ_MAX_DRIFT      = 450
REACQ_CONFIRM        = 8
REACQ_CONFIRM_FAST   = 4
WRIST_ACTIVITY_THR   = 12.0
MAX_JUMP_PX          = 200

def _find_mp_model():
    candidates = [
        Path(__file__).parent.parent / "pose_landmarker_heavy.task",
        Path(__file__).parent.parent.parent.parent / "syncFramework" / "pose_landmarker_heavy.task",
        Path("pose_landmarker_heavy.task"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    raise FileNotFoundError(
        "pose_landmarker_heavy.task not found. Put it next to analyse.py or pass --model-path."
    )


def _mp_lm_xy(lm, mp_idx, W, H, vis_thr=0.25):
    l = lm[mp_idx]
    if getattr(l, "visibility", 1.0) < vis_thr:
        return None
    return l.x * W, l.y * H


def _get_torso_mp(lm, W, H):
    ls = _mp_lm_xy(lm, 11, W, H, vis_thr=0.20)
    rs = _mp_lm_xy(lm, 12, W, H, vis_thr=0.20)
    if ls and rs:
        return ((ls[0]+rs[0])/2, (ls[1]+rs[1])/2), abs(rs[0]-ls[0])
    return None, None


def _select_boxer_mp(lm_list, last_torso, W, H):
    if not lm_list:
        return None
    if last_torso is None:
        return lm_list[0]
    best_lm, best_dist = lm_list[0], float("inf")
    for lm in lm_list:
        t, _ = _get_torso_mp(lm, W, H)
        if t:
            d = math.dist(t, last_torso)
            if d < best_dist:
                best_dist = d; best_lm = lm
    return best_lm


def _wrist_active_mp(buf):
    lxs = [p[0] for p in buf if p[0] is not None]
    rxs = [p[2] for p in buf if p[2] is not None]
    return ((len(lxs) >= 4 and float(np.std(lxs)) > WRIST_ACTIVITY_THR) or
            (len(rxs) >= 4 and float(np.std(rxs)) > WRIST_ACTIVITY_THR))


def _apply_jump_filter(raw_jx, raw_jy, max_jump=MAX_JUMP_PX):
    for j in DRAW_JOINTS:
        xs = raw_jx[j]; ys = raw_jy[j]
        for k in range(1, len(xs)):
            if not (np.isnan(xs[k]) or np.isnan(xs[k-1])):
                if math.dist((xs[k], ys[k]), (xs[k-1], ys[k-1])) > max_jump:
                    xs[k] = np.nan; ys[k] = np.nan


def extract_mediapipe(video_path, fps, H, W, duration_s=None, start_s=0.0, model_path=None):
    if not HAS_MEDIAPIPE:
        raise RuntimeError("mediapipe not installed")

    mp_model = model_path or _find_mp_model()
    print("Pass 1 - MediaPipe PoseLandmarker (Heavy), states: CALIBRATING / TRACKING / OCCLUDED")

    base_opts = mp_tasks.BaseOptions(model_asset_path=mp_model)
    options   = mp_vision.PoseLandmarkerOptions(
        base_options=base_opts,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=2,
        min_pose_detection_confidence=0.45,
        min_pose_presence_confidence=0.45,
        min_tracking_confidence=0.45,
    )
    lander = mp_vision.PoseLandmarker.create_from_options(options)
    cap    = cv2.VideoCapture(video_path)
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start_frame = int(start_s * fps)
    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        total = max(0, total - start_frame)
    if duration_s is not None:
        total = min(total, int(duration_s * fps))

    raw_jx = {j: np.full(total, np.nan) for j in DRAW_JOINTS}
    raw_jy = {j: np.full(total, np.nan) for j in DRAW_JOINTS}

    state      = "CALIBRATING"
    calib_buf  = []
    torso_ref  = None
    shw_ref    = None
    last_jack  = None
    prev_torso = None
    occ_count  = 0
    rec_count  = 0
    reacq_buf  = []

    fidx = 0
    while True:
        ok, frame = cap.read()
        if not ok or fidx >= total: break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = lander.detect_for_video(img, int(fidx * 1000 / fps))

        lm = _select_boxer_mp(res.pose_landmarks, last_jack, W, H)
        accept = True

        if lm is not None:
            torso, shw = _get_torso_mp(lm, W, H)

            if state == "CALIBRATING":
                if torso:
                    calib_buf.append((torso, shw))
                if fidx >= BOXER_CALIB_FRAMES - 1 and calib_buf:
                    xs  = [c[0][0] for c in calib_buf]
                    ys  = [c[0][1] for c in calib_buf]
                    sws = [c[1] for c in calib_buf if c[1] is not None]
                    torso_ref = (float(np.median(xs)), float(np.median(ys)))
                    shw_ref   = float(np.median(sws)) if sws else None
                    last_jack = torso_ref
                    state     = "TRACKING"
                    print(f"  Boxer calibrated, torso at ({torso_ref[0]:.0f},{torso_ref[1]:.0f})"
                          f"  shw={shw_ref:.0f}px")

            elif torso is not None:
                wider  = shw_ref and shw and shw > shw_ref * SHOULDER_WIDTH_RATIO
                jumped = prev_torso is not None and math.dist(torso, prev_torso) > TORSO_JUMP_THR

                if state == "TRACKING":
                    if wider or jumped:
                        occ_count += 1
                        if occ_count >= OCCLUSION_CONFIRM:
                            state     = "OCCLUDED"
                            rec_count = 0
                            reacq_buf.clear()
                            print(f"  Boxer occluded at t={fidx/fps:.1f}s")
                        accept = False
                    else:
                        occ_count = 0
                        last_jack = torso

                elif state == "OCCLUDED":
                    cand_lm = None; cand_torso = None; best_d = float("inf")
                    reacq_ratio = SHOULDER_WIDTH_RATIO + REACQ_SHW_MARGIN
                    for c in (res.pose_landmarks or []):
                        ct, cs = _get_torso_mp(c, W, H)
                        if ct is None: continue
                        shw_ok  = shw_ref is None or cs is None or cs < shw_ref * reacq_ratio
                        near_ok = torso_ref is None or math.dist(ct, torso_ref) < REACQ_MAX_DRIFT
                        if shw_ok and near_ok:
                            d = math.dist(ct, last_jack) if last_jack else 0
                            if d < best_d:
                                best_d = d; cand_lm = c; cand_torso = ct
                    if cand_lm is not None:
                        lw = _mp_lm_xy(cand_lm, 15, W, H, 0.25)
                        rw = _mp_lm_xy(cand_lm, 16, W, H, 0.25)
                        reacq_buf.append((
                            lw[0] if lw else None, lw[1] if lw else None,
                            rw[0] if rw else None, rw[1] if rw else None,
                        ))
                        if len(reacq_buf) > 20: reacq_buf.pop(0)
                        rec_count += 1
                        need = REACQ_CONFIRM_FAST if _wrist_active_mp(reacq_buf) else REACQ_CONFIRM
                        if rec_count >= need:
                            state     = "TRACKING"
                            last_jack = cand_torso
                            occ_count = 0
                            mode = "FAST" if need == REACQ_CONFIRM_FAST else "POS"
                            print(f"  Re-acquired boxer [{mode}] at t={fidx/fps:.1f}s")
                    else:
                        rec_count = 0; reacq_buf.clear()
                    accept = False

            prev_torso = torso if torso else None
        else:
            prev_torso = None

        if accept and lm is not None:
            for mp_idx, coco_idx in _MP_TO_COCO.items():
                if coco_idx not in DRAW_JOINTS: continue
                vis = getattr(lm[mp_idx], "visibility", 1.0)
                if vis >= 0.30:
                    raw_jx[coco_idx][fidx] = lm[mp_idx].x * W
                    raw_jy[coco_idx][fidx] = lm[mp_idx].y * H

        fidx += 1
        if fidx % 300 == 0:
            print(f"  frame {fidx}/{total}  t={fidx/fps:.1f}s")

    cap.release(); lander.close()
    _apply_jump_filter(raw_jx, raw_jy)
    print(f"  Done. {fidx} frames processed.")
    return raw_jx, raw_jy, fidx


def extract_landmarks(video_path, fps, H, W,
                      duration_s=None, start_s=0.0, model_path=None, **_):
    return extract_mediapipe(video_path, fps, H, W, duration_s, start_s, model_path)
