"""Vòng 21 – tiếp vòng 20 (rà soát: ngưỡng bật 3% tốt nhất lại nằm ở MÉP lưới; luật đỉnh nhịp nảy chỉ có lợi ở 2025H2, 2026 thì thua giữ đủ 60 phút;
thoát khi BTC sập thì tệ hơn vì coin thường bật lại). Thử:
  ub{b}  = đỉnh nhịp nảy chỉ khi đã bật ≥ b bps từ đáy, mở rộng b = 300 / 400 / 500 / 750 / 1000
  ur{q}  = đỉnh nhịp nảy chỉ khi đã bật ≥ q% độ sâu lỗ lớn nhất (tương đối), q = 30 / 50
  ba{Y}  = khi BTC có nến 1 phút ngược lệnh ≥ 50 bps (z ≥ 4): KHÔNG đóng ngay mà đặt cắt lỗ cách lời/lỗ lúc đó Y bps (chỉ ra nếu còn rơi tiếp), Y = 200 / 400
  bp10   = khi BTC sập ngược lệnh ≥ 50 bps: tạm dừng luật đỉnh nhịp nảy 10 phút (tránh bán vào nhịp bật sau cú sập)
Phân tích: research/r21_calc.py – chọn trên 2025, kiểm trên 2026, bootstrap theo ngày cho phần chênh so với HIỆN TẠI.
Chạy: python research/round21.py"""
import concurrent.futures as cf
import gzip
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round21.log")
import round20 as R20  # noqa: E402
import round15 as R15  # noqa: E402
import round6 as R6  # noqa: E402
import events as E  # noqa: E402

log = E.log


def sim(kind, prm, fav, adv, o_all, side, tb):
    A, Gp = 150, 100; peak = 0.0; M, T, S = R6.IN_M, R6.OUT_T, R6.OUT_S
    v, a = R15.deriv(np.asarray(o_all[:62], dtype=float), 9)
    lo = 0.0; arm = None; pause = -1
    for k in range(60):
        ad, f = adv[k], fav[k]
        if ad <= -R6.CAT:
            return -R6.CAT - M - S, "S"
        if arm is not None and ad <= arm:
            return arm - M - S, "B"
        if peak >= A and ad <= peak - Gp:
            return peak - Gp - M - S, "R"
        peak = max(peak, f); lo = min(lo, ad)
        j = k + 1
        p = o_all[j]
        if prm.get("x"):
            rb, zb = R20.btc_at(tb + k)
            if side * rb <= -prm["x"] and zb >= 4:
                if prm.get("y") and arm is None:
                    arm = p - prm["y"]
                if prm.get("pz"):
                    pause = j + prm["pz"]
        if prm.get("u") and j > pause and np.isfinite(v[j]) and j >= 40 and p < 0 and v[j] <= 0 and a[j] < 0 and v[j - 1] > 0:
            ok = True
            if prm.get("b"):
                ok = p - lo >= prm["b"]
            if prm.get("rq"):
                ok = lo < 0 and (p - lo) >= prm["rq"] * -lo
            if ok:
                return p - M - T, "U"
    return o_all[60] - M - T, "T"


R20.sim = sim
R20.RULES = [("cur", dict(u=True)), ("t60", dict(u=False))] \
    + [(f"ub{b}", dict(u=True, b=b)) for b in (200, 300, 400, 500, 750, 1000)] \
    + [(f"ur{int(q * 100)}", dict(u=True, rq=q)) for q in (0.3, 0.5)] \
    + [(f"ba{y}", dict(u=True, x=50, y=y)) for y in (200, 400)] \
    + [("bp10", dict(u=True, x=50, pz=10))] \
    + [(f"ub{b}ba400", dict(u=True, b=b, x=50, y=400)) for b in (300, 500)]

if __name__ == "__main__":
    t00 = time.time()
    R20.btc_load()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày · {len(R20.RULES)} cách thoát")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(R20.process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round21.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    log(f"{len(evs)} cú sốc · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r21_calc.py')} {os.path.join(E.OUT, 'round21.json.gz')} > {os.path.join(E.OUT, 'r21_result.md')} 2>&1")
