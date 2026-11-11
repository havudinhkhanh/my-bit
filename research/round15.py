"""Vòng 15 – thoát lệnh Bắt râu sập bằng GIẢI TÍCH trên đường lời/lỗ từng phút (Jason hỏi 11/11/2026: lệnh đôi khi không lên tới mốc chốt lời –
tính đạo hàm / nguyên hàm, đường cong để biết đã tới đỉnh hồi chưa mà ra). Vòng 14 đã thử thoát theo "mốc thời gian + mức lỗ": không cách nào hơn hiện tại.
Vòng này dùng hình dạng đường cong p(k) = lời/lỗ (bps) ở giá mở nến phút k, khớp parabol trượt w phút (Savitzky–Golay nhân quả – chỉ dùng dữ liệu đã có):
  v(k) = đạo hàm bậc 1 (tốc độ hồi, bps/phút) · a(k) = đạo hàm bậc 2 (độ cong) · A(k) = Σp = nguyên hàm (diện tích lời/lỗ theo thời gian).
  D(w, y): đang lời ≥ y mà v ≤ 0 và a < 0 (đỉnh hồi đã cong xuống) → đóng thị trường.
  G(w, g): đang lời ≥ 100 mà tốc độ hồi còn ≤ g × tốc độ lớn nhất từng có (đà cạn) → đóng.
  U(m, w): từ phút m còn lỗ: chờ một nhịp nảy rồi ra ở đỉnh nảy (v vừa đổi từ dương sang ≤ 0, a < 0) thay vì giữ tới 60 phút.
  I(m, x): từ phút m, lời/lỗ TRUNG BÌNH từ lúc vào (A/k) ≤ −x và v ≤ 0 (chìm sâu, lâu, chưa ngóc) → đóng.
  H(y0, tau): mốc chốt lời hạ dần theo thời gian y(k) = y0·e^(−k/tau) (Leung & Li 2015: càng ít thời gian / rủi ro càng cao thì mốc chốt tối ưu càng thấp) – lệnh giới hạn.
  HD(y0, tau, w): H + D(w, 100).
Mọi cách đều giữ nguyên phần hiện tại: cắt lỗ đuổi tr150 (lời ≥ 150 thì đuổi cách đỉnh 100), cắt thảm hoạ, hết 60 phút thì đóng.
Phân tích danh mục: research/r15_calc.py. Chạy: python research/round15.py"""
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round15.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402

_sim0 = R6.sim
_W = {}


def sg(w):
    """Hệ số khớp parabol trên w điểm cuối (x = −(w−1)…0): trả (hệ số cho đạo hàm bậc 1 tại x = 0, hệ số cho đạo hàm bậc 2)."""
    if w not in _W:
        x = np.arange(-(w - 1), 1.0); P = np.linalg.pinv(np.vstack([np.ones(w), x, x * x]).T)
        _W[w] = (P[1], 2 * P[2])
    return _W[w]


def deriv(o, w):
    """v[j], a[j] ứng với điểm o[j] (j ≥ w−1); phần đầu chưa đủ điểm = nan."""
    b, c = sg(w); n = len(o); v = np.full(n, np.nan); a = np.full(n, np.nan)
    if n >= w:
        v[w - 1:] = np.convolve(o, b[::-1], "valid"); a[w - 1:] = np.convolve(o, c[::-1], "valid")
    return v, a


def sim(kind, prm, fav, adv, o_end, o_all, L, side, c0):
    if kind not in ("D", "G", "U", "I", "H", "HD"):
        return _sim0(kind, prm, fav, adv, o_end, o_all, L, side, c0)
    A, Gp = 150, 100; peak = 0.0; M, T, S, Pm = R6.IN_M, R6.OUT_T, R6.OUT_S, R6.OUT_P
    w = prm[0] if kind in ("D", "G") else prm[1] if kind == "U" else prm[2] if kind == "HD" else 5
    v, a = deriv(np.asarray(o_all[:62], dtype=float), w)
    area = 0.0; vmax = 0.0
    for k in range(60):
        ad, f = adv[k], fav[k]
        if ad <= -R6.CAT:
            return -R6.CAT - M - S, "S"
        if kind in ("H", "HD"):
            y = prm[0] * math.exp(-k / prm[1])
            if y >= 30 and f >= y + R6.THR:
                return y - M - Pm, "P"
        if peak >= A and ad <= peak - Gp:
            return peak - Gp - M - S, "R"
        peak = max(peak, f)
        j = k + 1                       # nến k vừa đóng → biết giá mở nến j; quyết định & khớp ở chính giá mở đó
        p = o_all[j]; area += p
        if not np.isfinite(v[j]):
            continue
        vmax = max(vmax, v[j])
        if kind == "D" and p >= prm[1] and v[j] <= 0 and a[j] < 0:
            return p - M - T, "D"
        if kind == "HD" and p >= 100 and v[j] <= 0 and a[j] < 0:
            return p - M - T, "D"
        if kind == "G" and p >= 100 and vmax >= 15 and v[j] <= prm[1] * vmax:
            return p - M - T, "G"
        if kind == "U" and j >= prm[0] and p < 0 and v[j] <= 0 and a[j] < 0 and v[j - 1] > 0:
            return p - M - T, "U"
        if kind == "I" and j >= prm[0] and area / j <= -prm[1] and v[j] <= 0:
            return p - M - T, "I"
    return o_all[60] - M - T, "T"


R6.sim = sim
R8.DS = (1.25, 1.5)
R8.RULES = [("tr150", "R", (150, 100))] \
    + [(f"d{w}_{y}", "D", (w, y)) for w in (5, 7, 9, 12) for y in (50, 100, 200, 300, 500)] \
    + [(f"g{w}_{int(g * 100)}", "G", (w, g)) for w in (5, 9) for g in (0.0, 0.25, 0.5)] \
    + [(f"u{m}_{w}", "U", (m, w)) for m in (10, 20, 30, 40) for w in (5, 7, 9)] \
    + [(f"i{m}_{x}", "I", (m, x)) for m in (10, 15, 20, 30) for x in (150, 300, 500, 800)] \
    + [(f"h{y}_{t}", "H", (y, t)) for y in (600, 1000, 1500, 2500) for t in (15, 30, 60)] \
    + [(f"hd{y}_{t}_{w}", "HD", (y, t, w)) for y in (1000, 1500) for t in (30, 60) for w in (7, 9)]

if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    E.log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này · {len(R8.RULES)} cách thoát")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(R8.process, syms)):
            evs += out
            if k % 100 == 0:
                E.log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round15.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    E.log(f"{len(evs)} cú sốc · có khớp {sum(1 for e in evs if e['res'])} · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r15_calc.py')} {os.path.join(E.OUT, 'round15.json.gz')} > {os.path.join(E.OUT, 'r15_result.md')} 2>&1")
