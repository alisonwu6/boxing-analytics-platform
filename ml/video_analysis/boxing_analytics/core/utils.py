"""Shared signal-processing utilities (no external dependencies beyond numpy)."""

from typing import List, Tuple

import numpy as np


def gaussian_smooth(x: np.ndarray, sigma: float = 4.0) -> np.ndarray:
    """Apply Gaussian smoothing to a 1-D array."""
    if sigma <= 0:
        return x.copy()
    hw = int(4 * sigma)
    k  = np.arange(-hw, hw + 1, dtype=float)
    g  = np.exp(-0.5 * (k / sigma) ** 2)
    g /= g.sum()
    return np.convolve(x, g, mode="same")


def finite_diff(x: np.ndarray, dt: float, order: int = 1) -> np.ndarray:
    out = x.copy()
    for _ in range(order):
        out = np.gradient(out, dt)
    return out


def find_peaks_simple(
    x: np.ndarray,
    min_prominence: float = 0.0,
    min_distance_samples: int = 1,
) -> np.ndarray:
    """Find local maxima with prominence and distance constraints."""
    n = len(x)
    raw = [i for i in range(1, n - 1) if x[i] > x[i - 1] and x[i] > x[i + 1]]
    peaks: List[int] = []
    for c in raw:
        if not peaks or (c - peaks[-1]) >= min_distance_samples:
            peaks.append(c)
        elif x[c] > x[peaks[-1]]:
            peaks[-1] = c
    if min_prominence > 0:
        peaks = [p for p in peaks
                 if x[p] - np.min(x[max(0, p - 40):p + 41]) >= min_prominence]
    return np.array(peaks, dtype=int)


def cross_correlate_offset(
    t_ref: np.ndarray, sig_ref: np.ndarray,
    t_qry: np.ndarray, sig_qry: np.ndarray,
    fs: float = 30.0,
    search_s: Tuple[float, float] = (-20.0, 20.0),
) -> float:
    """Return lag (s) that maximises cross-correlation: qry_real = qry - lag."""
    dt = 1.0 / fs
    t0 = min(t_ref[0], t_qry[0])
    t1 = max(t_ref[-1], t_qry[-1])
    t_c = np.arange(t0, t1 + dt, dt)
    sr  = np.interp(t_c, t_ref, sig_ref, left=0, right=0)
    sq  = np.interp(t_c, t_qry, sig_qry, left=0, right=0)
    sr  = (sr - sr.mean()) / (sr.std() + 1e-9)
    sq  = (sq - sq.mean()) / (sq.std() + 1e-9)
    corr = np.correlate(sr, sq, mode="full")
    lags = (np.arange(len(corr)) - (len(sq) - 1)) * dt
    lo   = np.searchsorted(lags, search_s[0])
    hi   = np.searchsorted(lags, search_s[1])
    return float(lags[lo + np.argmax(corr[lo:hi])])